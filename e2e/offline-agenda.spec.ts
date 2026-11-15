import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-405: la agenda sin conexión (PWA).
 *
 * Una clínica nueva por corrida con recepción, un odontólogo y una paciente
 * con cita MAÑANA en la sede (con teléfono y alerta médica de nada: sale «no»).
 *
 * A 1440 y a 390 px:
 * 1. Con red, la agenda ofrece la copia sin conexión: se fija el PIN y la
 *    agenda guarda su copia cifrada (`…/contingency-agenda/offline`).
 * 2. `context.setOffline(true)`: en la MISMA pestaña pasa sola a la copia
 *    («Sin conexión · datos de las HH:MM», la cita de mañana, «Nueva cita»
 *    inactivo con su motivo); al volver la red el aviso se va.
 * 3. «Equipo reiniciado»: sin la clave de la pestaña (se borra su
 *    sessionStorage), sin red, se RECARGA: la agenda pide el PIN y no enseña
 *    nada; con un PIN malo tampoco; con el bueno, la copia. Recargar sin red
 *    necesita el service worker (`public/sw.js`), que solo se registra en
 *    producción: la E2E de la CI corre `next build` + `next start` (ver
 *    `.github/workflows/e2e.yml` y `scripts/e2e-ci.sh`), así que allí es
 *    obligatorio. En local con `next dev` esa parte se anota y no se ejecuta.
 * 4. Cerrar sesión borra la clave envuelta, la agenda cifrada y la clave y la
 *    marca de la pestaña.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sinred-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.sinred.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sinred', email: `luis.sinred.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.sinred.${suffix}@example.com` };
const patient = { firstName: 'Sara', lastName: `Offline${suffix.slice(0, 8)}`, phone: '+58 412 1234567' };
const TOMORROW = sedeDayFromToday(1);
const PIN = '2468';
const QA_DIR = process.env.DX405_QA_DIR ?? 'test-results';
/** El service worker solo existe con `next start` (la CI). */
const PRODUCTION_WEB = process.env.E2E_WEB_SERVER === 'start' || process.env.E2E_WEB_SERVER === 'none' || !!process.env.CI;

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sin Red ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  const created = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: patient.firstName,
    lastName: patient.lastName,
    phone: patient.phone,
    docType: 'NATIONAL_ID',
    docNumber: `S${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await apiPost(request, session, '/appointments', {
    patientId: created.id,
    providerId,
    start: atSede(TOMORROW, '10:00').toISOString(),
    end: atSede(TOMORROW, '10:30').toISOString(),
  });
});

/** Abre la agenda con red y espera a que guarde su copia cifrada. */
async function openAgendaAndSync(page: Page) {
  const synced = waitForSync(page);
  await page.goto(`${origin}/agenda`);
  await synced;
}

function waitForSync(page: Page) {
  return page
    .waitForResponse((res) => res.url().includes('/contingency-agenda/offline') && res.request().method() === 'GET')
    .then((res) => {
      expect(res.status()).toBe(200);
      // La API no deja que la respuesta se guarde en cachés HTTP.
      expect(res.headers()['cache-control']).toBe('private, no-store');
    });
}

/** Con red: la agenda ofrece la copia; se fija el PIN y se guarda la primera copia. */
async function activateWithPin(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Activar con PIN' }).click();
  const dialog = page.getByRole('dialog', { name: 'PIN de la agenda sin conexión' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('PIN (4 a 6 dígitos)').fill(PIN);
  await dialog.getByLabel('Repite el PIN').fill(PIN);
  const synced = waitForSync(page);
  await dialog.getByRole('button', { name: 'Guardar PIN' }).click();
  await expect(dialog).toHaveCount(0);
  await synced;
  await expect(page.getByText('Copia sin conexión activa en este equipo.')).toBeVisible();
}

async function expectOfflineCopy(page: Page) {
  const notice = page.getByTestId('offline-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/Sin conexión · datos de las \d{1,2}:\d{2}/);
  const tomorrow = page.getByRole('region', { name: /^Mañana/ });
  await expect(tomorrow.getByText(`${patient.firstName} ${patient.lastName}`)).toBeVisible();
  await expect(tomorrow.getByText('10:00–10:30')).toBeVisible();
  await expect(tomorrow.getByText(dentist.fullName)).toBeVisible();
  await expect(tomorrow.getByRole('link', { name: /Llamar a Sara/ })).toBeVisible();
  // Crear y editar, inactivos, con el motivo.
  const create = page.getByRole('button', { name: 'Nueva cita' });
  await expect(create).toHaveCount(1);
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription(/Sin conexión no se pueden crear ni editar citas/);
}

async function expectBackOnline(page: Page) {
  await expect(page.getByTestId('offline-notice')).toHaveCount(0);
  await expect(page.getByTestId('offline-agenda')).toHaveCount(0);
  // La agenda de siempre, con red: su «Agenda de contingencia» (recepción).
  await expect(page.getByRole('button', { name: 'Agenda de contingencia' }).first()).toBeVisible();
}

for (const { width, height, label } of [
  { width: 1440, height: 900, label: '1440' },
  { width: 390, height: 844, label: '390' },
]) {
  test(`${label} px: PIN, sin red en la misma pestaña; reiniciado, sin PIN no se ve y con PIN sí`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await loginAs(page, origin, reception.email, password);
    await activateWithPin(page);

    // Misma pestaña: la clave está en su memoria/sessionStorage, sin PIN.
    await context.setOffline(true);
    await expectOfflineCopy(page);
    if (width === 390) await expectNoHorizontalScroll(page);
    await page.screenshot({ path: `${QA_DIR}/dx405-sin-conexion-${label}.png`, fullPage: true });
    const violations = (await axeViolations(page, page.getByTestId('offline-agenda'))).filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    await context.setOffline(false);
    await expectBackOnline(page);

    if (!PRODUCTION_WEB) {
      testInfo.annotations.push({
        type: 'nota',
        description: 'next dev: sin service worker, no se prueba la recarga sin red (la CI usa next start).',
      });
      return;
    }

    // El service worker controla la página y guardó `/agenda` y sus estáticos.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(() => page.evaluate(async () => !!(await caches.match('/agenda', { cacheName: 'dentalix-pages-v1' }))), {
        timeout: 30_000,
      })
      .toBe(true);
    await openAgendaAndSync(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // «Equipo reiniciado»: la pestaña pierde la clave desenvuelta.
    await page.evaluate(() => sessionStorage.removeItem('dentalix.offline.key'));
    await context.setOffline(true);
    await page.reload();
    const locked = page.getByTestId('offline-locked');
    await expect(locked).toBeVisible();
    await expect(page.getByText(`${patient.firstName} ${patient.lastName}`)).toHaveCount(0);
    if (width === 390) await expectNoHorizontalScroll(page);
    await page.screenshot({ path: `${QA_DIR}/dx405-pin-${label}.png`, fullPage: true });

    // PIN malo: no se ve nada y dice cuántos intentos quedan.
    await locked.getByLabel('PIN (4 a 6 dígitos)').fill('1357');
    await locked.getByRole('button', { name: 'Abrir' }).click();
    await expect(locked.getByText(/PIN incorrecto\. Te quedan 4 intentos/)).toBeVisible();
    await expect(page.getByText(`${patient.firstName} ${patient.lastName}`)).toHaveCount(0);

    // PIN bueno: la copia.
    await locked.getByLabel('PIN (4 a 6 dígitos)').fill(PIN);
    await locked.getByRole('button', { name: 'Abrir' }).click();
    await expectOfflineCopy(page);
    await page.screenshot({ path: `${QA_DIR}/dx405-recarga-sin-conexion-${label}.png`, fullPage: true });

    // Vuelve la red: renueva la sesión con la cookie y monta la agenda de siempre.
    await context.setOffline(false);
    await expectBackOnline(page);
  });
}

test('cerrar sesión borra la clave envuelta, la agenda cifrada y la clave y la marca de la pestaña', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await activateWithPin(page);
  // [clave de la pestaña, marca de sesión, clave envuelta (IndexedDB), agenda cifrada (IndexedDB)]
  const counts = () =>
    page.evaluate(
      () =>
        new Promise<number[]>((resolve, reject) => {
          const tab = [
            sessionStorage.getItem('dentalix.offline.key') ? 1 : 0,
            sessionStorage.getItem('dentalix.offline.session') ? 1 : 0,
          ];
          const req = indexedDB.open('dentalix-offline');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('vault')) return resolve([...tab, 0, 0]);
            const tx = db.transaction(['vault', 'agenda'], 'readonly');
            const v = tx.objectStore('vault').count();
            const a = tx.objectStore('agenda').count();
            tx.oncomplete = () => resolve([...tab, v.result, a.result]);
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
  await expect.poll(counts).toEqual([1, 1, 1, 1]);

  await page.getByRole('button', { name: new RegExp(reception.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });
  await expect.poll(counts).toEqual([0, 0, 0, 0]);
});

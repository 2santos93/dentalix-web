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
 * 1. 1440 px: la agenda guarda su copia cifrada (`…/contingency-agenda/offline`);
 *    con `context.setOffline(true)` pasa sola a la copia: «Sin conexión · datos
 *    de las HH:MM», la cita de mañana con su teléfono y «Nueva cita» inactivo
 *    con su motivo. Al volver la red el aviso se va y vuelve la agenda de
 *    siempre.
 * 2. 390 px: lo mismo y, además, RECARGAR sin red (en la misma pestaña; otra
 *    pestaña sin la sesión no ve nada). Eso necesita el service
 *    worker (`public/sw.js`), que solo se registra en producción: la E2E de la
 *    CI corre `next build` + `next start` (ver `.github/workflows/e2e.yml` y
 *    `scripts/e2e-ci.sh`), así que allí es obligatorio. En local con `next dev`
 *    (E2E_WEB_SERVER sin definir) no hay service worker y esa parte se anota y
 *    no se ejecuta.
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
  const synced = page.waitForResponse(
    (res) => res.url().includes('/contingency-agenda/offline') && res.request().method() === 'GET',
  );
  await page.goto(`${origin}/agenda`);
  const res = await synced;
  expect(res.status()).toBe(200);
  // La API no deja que la respuesta se guarde en cachés HTTP.
  expect(res.headers()['cache-control']).toBe('private, no-store');
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

test('1440 px: sin red, la agenda pasa sola a la copia guardada; al volver, el aviso se va', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openAgendaAndSync(page);
  await expect(page.getByRole('button', { name: 'Agenda de contingencia' }).first()).toBeVisible();

  await context.setOffline(true);
  await expectOfflineCopy(page);
  await page.screenshot({ path: `${QA_DIR}/dx405-sin-conexion-1440.png`, fullPage: true });
  const violations = (await axeViolations(page, page.getByTestId('offline-agenda'))).filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

  await context.setOffline(false);
  await expectBackOnline(page);
});

test('390 px: sin red y RECARGANDO la página, la copia se abre; al volver la red, la agenda de siempre', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await openAgendaAndSync(page);

  // Sin recargar: igual que a 1440.
  await context.setOffline(true);
  await expectOfflineCopy(page);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `${QA_DIR}/dx405-sin-conexion-390.png`, fullPage: true });
  await context.setOffline(false);
  await expectBackOnline(page);

  if (!PRODUCTION_WEB) {
    testInfo.annotations.push({
      type: 'nota',
      description: 'next dev: sin service worker, no se prueba la recarga sin red (la CI usa next start).',
    });
    return;
  }

  // El service worker controla la página y ya guardó `/agenda` y sus estáticos.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(async () => !!(await caches.match('/agenda', { cacheName: 'dentalix-pages-v1' }))), {
      timeout: 30_000,
    })
    .toBe(true);
  // Una carga con el service worker al mando (guarda los estáticos de esta carga).
  await openAgendaAndSync(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expectOfflineCopy(page);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `${QA_DIR}/dx405-recarga-sin-conexion-390.png`, fullPage: true });

  // Otra pestaña (sin la sesión de ésta: su sessionStorage está vacía), como
  // quien abre el navegador de nuevo sin red: no enseña la copia.
  const other = await context.newPage();
  await other.setViewportSize({ width: 390, height: 844 });
  await other.goto(`${origin}/agenda`).catch(() => undefined);
  await other.waitForTimeout(2_000);
  await expect(other.getByTestId('offline-agenda')).toHaveCount(0);
  await expect(other.getByText(`${patient.firstName} ${patient.lastName}`)).toHaveCount(0);
  await other.close();

  // Vuelve la red: renueva la sesión con la cookie y monta la agenda de siempre.
  await context.setOffline(false);
  await expectBackOnline(page);
});

test('cerrar sesión borra la copia cifrada, su clave y la marca de la pestaña', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openAgendaAndSync(page);
  // [clave en sessionStorage, marca de sesión de la pestaña, agenda cifrada en IndexedDB]
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
            if (!db.objectStoreNames.contains('agenda')) return resolve([...tab, 0]);
            const tx = db.transaction('agenda', 'readonly');
            const a = tx.objectStore('agenda').count();
            tx.oncomplete = () => resolve([...tab, a.result]);
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
  await expect.poll(counts).toEqual([1, 1, 1]);

  await page.getByRole('button', { name: new RegExp(reception.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });
  await expect.poll(counts).toEqual([0, 0, 0]);
});

import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { openPatientTab } from './support/patient-tabs';
import { expectTouchTarget, touchPx, waitForAnimationsSettled } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-485 (FE-098, FE-093): objetivos táctiles de 44 px de verdad.
 *
 * Corre SOLO en el proyecto `touch` de `playwright.config.ts` (Pixel 7 con
 * `hasTouch` + `isMobile` a 390×844, que activan `pointer: coarse`): ahí
 * `pointer-coarse:` de las primitivas gana a cualquier `max-sm:` y es donde
 * DX-065 se rompía sin que la suite de escritorio lo viera.
 *
 * Una clínica nueva por corrida (ADMIN, una odontóloga y recepción, horario
 * lun–vie 9–13 y 15–19), y mide en el teléfono:
 * 1. Mes/Semana/Día de la agenda;
 * 2. «Cambiar» y «Quitar» del convenio en la ficha;
 * 3. «Reintentar» de la barra de dosis de anestesia (con el cálculo caído);
 * 4. «Abrir WhatsApp» de la oferta con enlace;
 * 5. «Ya es paciente / Paciente nuevo» de «Atender sin cita», sin recorte
 *    dentro del modal.
 * Y, en escritorio con puntero fino, que el `sm` sigue en 32 px.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `tactil-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Tania Titular', email: `tania.tt.${suffix}@example.com` };
const dentist = { fullName: 'Dora Táctil', email: `dora.tt.${suffix}@example.com` };
const reception = { fullName: 'Rosa Dedo', email: `rosa.tt.${suffix}@example.com` };
const last = `Tactil${suffix}`.slice(0, 40);
const agreementName = 'Surco táctil';
const ENTRY_NOTES = 'Exodoncia de 48, control táctil';

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}
const SLOT_DAY = weekdayFrom(2);

let session: ApiSession;
let agreementPatientId = '';
let anesthesiaPatientId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Táctil ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
      ranges: [1, 2, 3, 4, 5].flatMap((weekday) => [
        { weekday, startMinute: 540, endMinute: 780 },
        { weekday, startMinute: 900, endMinute: 1140 },
      ]),
    },
  });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();

  const patient = (firstName: string, n: number, extra: object = {}) =>
    apiPost<{ id: string }>(request, session, '/patients', {
      firstName,
      lastName: last,
      docType: 'NATIONAL_ID',
      docNumber: `TT${n}${suffix}`.slice(0, 20),
      sex: 'F',
      ...extra,
    });

  // Convenio asignado (SEC-047: con una cobertura viva del pagador).
  agreementPatientId = (await patient('Camila', 1)).id;
  const payer = await apiPost<{ id: string }>(request, session, '/payers', {
    name: `Pagador táctil ${suffix}`.slice(0, 60),
    type: 'PUBLIC_SYSTEM',
  });
  const coverage = await apiPost<{ id: string }>(request, session, `/patients/${agreementPatientId}/coverages`, {
    payerId: payer.id,
    planName: 'Plan Surco',
    memberNumber: '1020304050',
  });
  const agreement = await apiPost<{ id: string }>(request, session, '/agreements', {
    name: agreementName,
    payerId: payer.id,
    kind: 'PERCENT_DISCOUNT',
    percent: 20,
  });
  const assign = await request.put(`${API_URL}/patients/${agreementPatientId}/agreement`, {
    headers: session.headers,
    data: { agreementId: agreement.id, coverageId: coverage.id },
  });
  expect(assign.ok(), await assign.text()).toBeTruthy();

  // Adulta con una evolución: la barra de dosis no pide peso.
  anesthesiaPatientId = (await patient('Lidia', 2, { birthDate: '1990-05-01' })).id;
  await apiPost(request, session, `/patients/${anesthesiaPatientId}/clinical-entries`, {
    reason: 'Exodoncia simple',
    notes: ENTRY_NOTES,
  });

  // Dos pendientes con permiso de WhatsApp para la oferta con enlace.
  for (const [name, n] of [['Ana', 3], ['Carla', 4]] as const) {
    const { id } = await patient(name, n, { phone: '3101234567' });
    const optIn = await request.patch(`${API_URL}/patients/${id}/communication`, {
      headers: session.headers,
      data: { whatsappOptIn: true, whatsappOptInSource: 'IN_PERSON' },
    });
    expect(optIn.ok(), await optIn.text()).toBeTruthy();
    await apiPost(request, session, '/waitlist', { patientId: id, durationMinutes: 30 });
  }
});

/** La premisa del proyecto: el navegador se presenta con un dedo, no un ratón. */
async function expectCoarsePointer(page: Page, coarse: boolean): Promise<void> {
  expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(coarse);
}

/** Alto en píxeles, ya en reposo. */
async function heightOf(target: Locator): Promise<number> {
  await waitForAnimationsSettled(target);
  const box = await target.boundingBox();
  expect(box, 'el control no tiene caja').not.toBeNull();
  return touchPx(box!.height);
}

test.describe('teléfono con pantalla táctil (390 px, pointer: coarse)', () => {
  test('agenda: Mes, Semana y Día miden 44 px', async ({ page }) => {
    await loginAs(page, origin, reception.email, password);
    await expectCoarsePointer(page, true);
    await page.goto(`${origin}/agenda`);
    const views = page.getByRole('group', { name: 'Vista', exact: true });
    for (const name of ['Mes', 'Semana', 'Día']) {
      await expectTouchTarget(views.getByRole('button', { name, exact: true }), { label: name });
    }
    // El carril crece con sus segmentos: nada recortado ni desplazable en vertical.
    expect(await views.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  });

  test('ficha: «Cambiar» y «Quitar» del convenio miden 44 px', async ({ page }) => {
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${agreementPatientId}`);
    const current = page.getByTestId('patient-agreement').getByTestId('agreement-current');
    await expect(current).toContainText(agreementName, { timeout: 15_000 });
    await current.scrollIntoViewIfNeeded();
    await expectTouchTarget(current.getByRole('button', { name: `Cambiar el convenio ${agreementName}` }), {
      label: 'Cambiar',
    });
    await expectTouchTarget(current.getByRole('button', { name: `Quitar el convenio ${agreementName}` }), {
      label: 'Quitar',
    });
  });

  test('anestesia: «Reintentar» de la barra de dosis mide 44 px', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${anesthesiaPatientId}`);
    await openPatientTab(page, 'Historia clínica');
    await expect(page.getByText(ENTRY_NOTES).locator('visible=true')).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole('button', { name: /Anestesia de la evolución del/ })
      .locator('visible=true')
      .click();
    const dialog = page.getByRole('dialog', { name: 'Anestesia local' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cargar anestésicos sugeridos' }).click();
    const anesthetic = dialog.getByLabel('Anestésico');
    await expect(anesthetic).toBeVisible({ timeout: 10_000 });

    // El cálculo de la dosis cae: la barra ofrece «Reintentar».
    await page.route('**/anesthesia/check', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    const firstAnesthetic = await anesthetic
      .locator('option')
      .evaluateAll((options) => (options as HTMLOptionElement[]).find((o) => o.value)?.value ?? '');
    await anesthetic.selectOption(firstAnesthetic);
    await dialog.getByLabel('Carpules').fill('1');
    const retry = dialog.getByRole('alert').getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeVisible({ timeout: 10_000 });
    await retry.scrollIntoViewIfNeeded();
    await expectTouchTarget(retry, { scope: dialog, label: 'Reintentar' });
    await page.unroute('**/anesthesia/check');
  });

  test('oferta con enlace: «Abrir WhatsApp» mide 44 px', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    // En el teléfono el Día abre en «Lista»; el hueco libre está en las columnas.
    await page.getByRole('button', { name: 'Columnas', exact: true }).click();
    await fillDate(page, 'Fecha', SLOT_DAY);
    await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: dentist.fullName, exact: true }).click();
    await page
      .locator(`[data-testid="day-column"][aria-label="${dentist.fullName}"]`)
      .getByRole('button', { name: `Hueco libre · 15:00–19:00 · Ocupar con ${dentist.fullName}` })
      .click();

    const panel = page.getByTestId('fill-opening-panel');
    await expect(panel.getByTestId('opening-candidate')).toHaveCount(2, { timeout: 10_000 });
    await panel.getByRole('checkbox', { name: `Elegir a Ana ${last} para la oferta con enlace` }).check();
    await panel.getByRole('button', { name: 'Enviar oferta con enlace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Enviar oferta con enlace' });
    await dialog.getByRole('radio', { name: /WhatsApp/ }).check();
    await dialog.getByRole('button', { name: 'Enviar oferta' }).click();
    const whatsapp = dialog.getByRole('link', { name: `Abrir WhatsApp con la oferta para Ana ${last}` });
    await expect(whatsapp).toBeVisible({ timeout: 10_000 });
    await expectTouchTarget(whatsapp, { scope: dialog, label: 'Abrir WhatsApp' });
  });

  test('«Atender sin cita»: los segmentos miden 44 px y el modal no los recorta', async ({ page }) => {
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/agenda/en-clinica`);
    await page.getByRole('button', { name: 'Atender sin cita' }).click();
    const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
    await expect(dialog).toBeVisible();
    const group = dialog.getByRole('radiogroup', { name: 'Paciente' });
    for (const name of ['Ya es paciente', 'Paciente nuevo']) {
      await expectTouchTarget(group.getByRole('radio', { name }), { scope: dialog, label: name });
    }
    // El carril envuelve a los segmentos: sin barra interna ni corte por abajo.
    expect(await group.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
    const track = (await group.boundingBox())!;
    for (const segment of await group.getByRole('radio').all()) {
      const box = (await segment.boundingBox())!;
      expect(touchPx(box.y + box.height)).toBeLessThanOrEqual(touchPx(track.y + track.height));
    }
  });
});

test.describe('escritorio con puntero fino (1440 px)', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

  test('el botón sm sigue en 32 px', async ({ page }) => {
    await loginAs(page, origin, admin.email, password);
    await expectCoarsePointer(page, false);
    await page.goto(`${origin}/patients/${agreementPatientId}`);
    const current = page.getByTestId('patient-agreement').getByTestId('agreement-current');
    await expect(current).toContainText(agreementName, { timeout: 15_000 });
    expect(await heightOf(current.getByRole('button', { name: `Cambiar el convenio ${agreementName}` }))).toBe(32);
  });
});

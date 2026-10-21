import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { LATE_BROWSER_TIME, atSede, lastSlotToday, type SedeSlot } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-200: flujo del paciente en la clínica.
 *
 * Una clínica nueva por corrida (una sola sede, sin restricción de horario)
 * con dos odontólogas («Lina Flujo» y «Marta Flujo») y recepción, y dos citas
 * de HOY a las 23:55–23:59 de la sede: Ana con Lina y Berta con Marta. El
 * navegador va con el reloj fijo a las 23:30 de Bogotá (DX-252, TST-030): la
 * misma agenda a cualquier hora, sin `test.skip` cerca de medianoche (ver
 * `lastSlotToday` en support/clock.ts). En serie:
 * 1. 1440 px: recepción marca «Llegó» en la tarjeta de Ana (Día · Lista) y la
 *    ve en el panel lateral «En clínica»; Lina ve «Te esperan 1» en la
 *    navegación, la pasa al sillón y la deja lista para cobrar desde
 *    /agenda/en-clinica; recepción la completa y el panel queda vacío;
 * 2. 390 px: recepción marca «Llegó» a Berta (botón de 44 px), abre «En
 *    clínica» en la hoja y «Deshacer llegada» la devuelve a la agenda, sin
 *    scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `flujo-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.flu.${suffix}@example.com` };
const dentist = { fullName: 'Lina Flujo', email: `lina.flu.${suffix}@example.com` };
const dentist2 = { fullName: 'Marta Flujo', email: `marta.flu.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.flu.${suffix}@example.com` };
const last = `Flujo${suffix}`.slice(0, 40);

let session: ApiSession;
/** La franja de HOY de las dos citas (23:55–23:59 de la sede). */
let slot: SedeSlot;

/** El reloj del navegador, fijo a las 23:30 de hoy en la sede (y corriendo desde ahí). */
async function lateEvening(page: Page) {
  await page.clock.install({ time: atSede(slot.day, LATE_BROWSER_TIME) });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Flujo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...dentist2, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  // Sin horario: las citas van a las 23:55 (ver disableBusinessHours).
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const idOf = (fullName: string) => members.find((m) => m.fullName === fullName)!.userId;

  slot = lastSlotToday();
  for (const [i, [name, providerId]] of ([
    ['Ana', idOf(dentist.fullName)],
    ['Berta', idOf(dentist2.fullName)],
  ] as const).entries()) {
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: name,
      lastName: last,
      docType: 'CC',
      docNumber: `FLU${i}${suffix}`.slice(0, 20),
      sex: 'F',
    });
    await apiPost(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      reason: 'Endodoncia',
    });
  }
});

async function openTodayList(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
}

test('1440 px: llegó → en sillón → listo para cobrar → completada', async ({ page, browser }) => {
  await lateEvening(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openTodayList(page);

  // La tarjeta de Ana: «Llegó» (recepción no tiene «En sillón»).
  const anaActions = page
    .getByRole('group', { name: `Estado de Ana ${last} en la clínica` })
    .first();
  await expect(anaActions.getByRole('button', { name: 'En sillón' })).toHaveCount(0);
  await anaActions.getByRole('button', { name: 'Llegó' }).click();
  await expect(page.getByText(`Ana ${last} llegó.`)).toBeVisible();

  // El panel lateral (≥ 1400 px) la muestra en espera, con su chip.
  const panel = page.getByRole('region', { name: 'En clínica' });
  const waiting = panel.getByTestId('in-clinic-group-waiting');
  await expect(waiting.getByTestId('in-clinic-item')).toHaveCount(1, { timeout: 10_000 });
  await expect(waiting.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`);
  await expect(waiting.getByTestId('in-clinic-item')).toHaveAttribute('data-punctuality', 'ON_TIME');
  await expect(waiting).toContainText('Espera 0 min');
  await expect(panel).not.toContainText('Endodoncia');

  // La odontóloga: «Te esperan 1» en la navegación y su panel.
  const lina = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Bogota', locale: 'es-CO' });
  await lateEvening(lina);
  await loginAs(lina, origin, dentist.email, password);
  await expect(lina.getByRole('link', { name: 'Agenda · Te espera 1 paciente' }).first()).toBeVisible({
    timeout: 15_000,
  });
  await lina.goto(`${origin}/agenda/en-clinica`);
  await expect(lina.getByRole('heading', { level: 1, name: 'Te esperan' })).toBeVisible();
  await lina.getByRole('button', { name: 'En sillón' }).click();
  const inChair = lina.getByTestId('in-clinic-group-inChair');
  await expect(inChair.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`, { timeout: 10_000 });
  await inChair.getByRole('button', { name: 'Listo para cobrar' }).click();
  const ready = lina.getByTestId('in-clinic-group-readyForCheckout');
  await expect(ready.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`, { timeout: 10_000 });
  // La salida es de recepción: la odontóloga no tiene «Completar».
  await expect(ready.getByRole('button', { name: 'Completar' })).toHaveCount(0);
  await lina.close();

  // Recepción la completa desde su panel (se relee al volver a la agenda).
  await page.goto(`${origin}/agenda/en-clinica`);
  const readyHere = page.getByTestId('in-clinic-group-readyForCheckout');
  await readyHere.getByRole('button', { name: 'Completar' }).click();
  await expect(page.getByText(`Cita de Ana ${last} completada.`)).toBeVisible();
  await expect(page.getByText('Nadie en espera')).toBeVisible({ timeout: 10_000 });

  await openTodayList(page);
  await expect(
    page.getByRole('row').filter({ hasText: `Ana ${last}` }).getByTestId('appointment-status-select'),
  ).toHaveValue('COMPLETED');
});

test('390 px: «Deshacer llegada» devuelve la cita a la agenda', async ({ page }) => {
  await lateEvening(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await openTodayList(page);

  const arrive = page
    .getByRole('group', { name: `Estado de Berta ${last} en la clínica` })
    .getByRole('button', { name: 'Llegó' });
  const box = await arrive.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await arrive.click();
  await expect(page.getByText(`Berta ${last} llegó.`)).toBeVisible();

  await page.getByRole('button', { name: /^En clínica/ }).click();
  const sheet = page.getByRole('dialog');
  const item = sheet.getByTestId('in-clinic-item').filter({ hasText: `Berta ${last}` });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await item.getByRole('button', { name: 'Deshacer llegada' }).click();
  await expect(page.getByText(`Se deshizo la llegada de Berta ${last}.`)).toBeVisible();
  await expect(sheet.getByText('Nadie en espera')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  // De vuelta en la agenda: confirmada… o agendada, como estaba; y con «Llegó».
  await expect(
    page.getByRole('group', { name: `Estado de Berta ${last} en la clínica` }).getByRole('button', {
      name: 'Llegó',
    }),
  ).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
});

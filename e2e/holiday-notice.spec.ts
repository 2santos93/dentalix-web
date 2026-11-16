import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeWeekdayFromToday } from './support/clock';
import { fillDate, fillTime } from './support/dates';
import { API_URL, tenantOrigin } from './support/urls';

// DX-358 → DX-263-bis: un festivo de la sede cierra ese día. «Nueva cita» lo
// avisa y no deja guardar (la API daría 409 LOCATION_HOLIDAY) y «Buscar
// hueco» no ofrece el día y dice por qué. A 1440 y 390 px.
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `festivo-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.festivo.${suffix}@example.com` };
const patientDoc = `FEST${suffix}`.slice(0, 20);
const patientLast = `Festivo${suffix}`.slice(0, 40);
const holiday = sedeWeekdayFromToday(5);
const normalDay = sedeWeekdayFromToday(12);
const closedMessage = 'Ese día la sede está cerrada por festivo (Fiesta de la Sede): elige otro día.';
let session: ApiSession;
let locationId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Festivo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  [{ id: locationId }] = (await locations.json()) as { id: string }[];
  await apiPost(request, session, `/locations/${locationId}/holidays`, {
    date: holiday,
    name: 'Fiesta de la Sede',
    recurring: false,
  });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: patientLast,
    docType: 'NATIONAL_ID',
    docNumber: patientDoc,
    sex: 'M',
  });
  await apiPost(request, session, '/waitlist', { patientId: patient.id, locationId, durationMinutes: 30 });
});

async function appointmentsCount(page: Page): Promise<number> {
  const res = await page.request.get(`${API_URL}/appointments?from=${holiday}T00:00:00.000Z&to=${normalDay}T23:59:59.000Z`, {
    headers: session.headers,
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as unknown[] | { items: unknown[] };
  return Array.isArray(body) ? body.length : body.items.length;
}

for (const width of [1440, 390]) {
  test.describe(`${width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await loginAs(page, origin, admin.email, password);
    });

    test('«Nueva cita» en un festivo lo avisa y no guarda; con otro día el aviso se va', async ({ page }) => {
      await page.goto(`${origin}/agenda`);
      await page.getByRole('main').getByRole('button', { name: 'Nueva cita' }).first().click();
      const form = page.getByRole('form', { name: 'Agendar cita' });
      await expect(form).toBeVisible();
      await form.getByLabel('Paciente', { exact: true }).fill(patientDoc);
      await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
      await form.getByLabel('Profesional', { exact: true }).selectOption({ label: admin.fullName });
      await fillDate(form, 'Fecha', holiday);
      await fillTime(form, 'Hora de inicio', '10:00');
      await fillTime(form, 'Hora de fin', '10:30');
      await expect(form.getByTestId('holiday-notice')).toHaveText(closedMessage, { timeout: 15_000 });

      const before = await appointmentsCount(page);
      await form.getByRole('button', { name: 'Agendar cita' }).click();
      await expect(form.getByText(closedMessage)).toHaveCount(2);
      await expect(form).toBeVisible();
      expect(await appointmentsCount(page)).toBe(before);

      await fillDate(form, 'Fecha', normalDay);
      await expect(form.getByTestId('holiday-notice')).toHaveCount(0, { timeout: 15_000 });
      // Sin scroll horizontal también en móvil.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('«Buscar hueco» no ofrece el festivo y dice por qué', async ({ page }) => {
      await page.goto(`${origin}/agenda`);
      let panel = page.getByRole('complementary', { name: 'Pendientes por agendar' });
      if (width === 390) {
        await page.getByRole('button', { name: /^Pendientes/ }).click();
        panel = page.getByRole('dialog', { name: 'Pendientes por agendar' });
      }
      const name = `Bruno ${patientLast}`;
      await panel.getByRole('button', { name: `Buscar hueco para ${name}` }).click({ timeout: 15_000 });
      const search = page.getByRole('dialog', { name: `Buscar hueco para ${name}` });
      await fillDate(search, 'Desde', holiday);
      await fillDate(search, 'Hasta', holiday);
      await search.getByRole('button', { name: 'Buscar' }).click();
      const empty = search.getByRole('status').filter({ hasText: 'No hay huecos libres en estas fechas' });
      await expect(empty).toBeVisible({ timeout: 10_000 });
      await expect(empty).toContainText('La sede cierra por festivo el');
      await expect(empty).toContainText('(Fiesta de la Sede): ese día no hay huecos.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

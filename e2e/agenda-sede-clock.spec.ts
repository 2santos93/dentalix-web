import { test, expect, type Page } from './support/test';
import { fillDate } from './support/dates';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { addCivilDays, wallDay, wallInstant } from '../src/lib/time/wall-clock';

/**
 * e2e DX-378 (FE-076): la agenda pinta la hora con la zona y el reloj de la
 * SEDE, no con los del navegador.
 *
 * Una clínica nueva con su sede en Caracas (UTC−4), `es-VE` y 12 h, y el
 * navegador en Tokio (UTC+9): trece horas de diferencia, así que la hora del
 * navegador cambiaría hasta el día de la cita. Una cita a las 3:30 p. m. de
 * la sede, dentro de dos días:
 *  1. Día (lista y columnas), Semana, Mes y el detalle dicen «3:30 p. m.»,
 *     en su día de la sede, a 1440 y 390 px sin scroll lateral.
 *  2. Una cita de hoy que llegó sale con la misma hora en la agenda y en
 *     «En clínica» (necesita E2E_DATABASE_URL para pasarla a hoy; sin ella se
 *     salta, permitido en e2e/allowed-skips.json).
 * Capturas a 390 y 1440 px en E2E_QA_DIR si está definido.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `reloj-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.reloj.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;
const MIN = 60_000;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede pasar a hoy una cita ya empezada';

const SEDE = {
  country: 'VE',
  currency: 'USD',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
} satisfies RegionalSettings;
const BROWSER_ZONE = 'Asia/Tokyo';
const fmt = regionalFormat({ locale: SEDE.locale, hourCycle: SEDE.hourCycle });

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

// El navegador en otra zona que la sede: la agenda no puede depender de él.
test.use({ timezoneId: BROWSER_ZONE });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let providerId: string;
/** Día de la sede de la cita futura y su inicio (3:30 p. m. de la sede). */
const futureDay = addCivilDays(wallDay(new Date(), SEDE.timeZone), 2);
const futureStart = wallInstant(futureDay, 15 * 60 + 30, SEDE.timeZone);
const futureEnd = new Date(futureStart.getTime() + 30 * MIN);
const futurePatient = `Reloj Futuro${suffix}`.slice(0, 40);
const todayPatient = `Reloj Hoy${suffix}`.slice(0, 40);

async function newPatient(request: Parameters<typeof apiPost>[0], firstName: string, lastName: string) {
  return apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName,
    docType: 'PASSPORT',
    docNumber: `R${lastName}`.slice(0, 20),
    sex: 'F',
  });
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${QA_DIR}/${name}-${width}.png`, fullPage: false });
}

async function openAgenda(page: Page, view: 'Mes' | 'Día' | 'Semana', day: string): Promise<void> {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: view, exact: true }).click();
  // En el teléfono el Día abre en «Lista»; la prueba empieza por las columnas.
  if (view === 'Día') await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await fillDate(page, 'Fecha', day);
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Reloj ${suffix}`,
    fullName: 'Ana Titular',
    email: adminEmail,
    password,
    location: SEDE,
  });
  // Sin horario de atención: se agenda a cualquier hora.
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  providerId = staff.find((m) => m.fullName === 'Ana Titular')!.userId;
  const [first, last] = futurePatient.split(' ');
  const patient = await newPatient(request, first, last);
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: futureStart.toISOString(),
    end: futureEnd.toISOString(),
  });
});

test('la agenda (día, semana, mes y detalle) pinta la hora de la sede en 12 h, con el navegador en otra zona', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const time = fmt.time(futureStart, SEDE.timeZone);
  const range = `${time} – ${fmt.time(futureEnd, SEDE.timeZone)}`;
  // La hora de la sede, no la del navegador (Tokio: 4:30 a. m. del día siguiente).
  expect(time).toBe('3:30 p. m.');
  expect(range).toBe('3:30 p. m. – 4:00 p. m.');

  await loginAs(page, origin, adminEmail, password);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Día · columnas: tarjeta en su día y a su hora, con su nombre accesible.
    await openAgenda(page, 'Día', futureDay);
    const card = page.getByTestId('day-column-appointment').filter({ hasText: futurePatient });
    await expect(card).toContainText(range, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: new RegExp(`^Detalle de la cita de ${range}`) })).toBeVisible();
    await expect(page.getByText('3:00 p. m.', { exact: true }).first()).toBeAttached();
    await expectNoHorizontalScroll(page);
    await shoot(page, 'agenda-dia-columnas', viewport.width);

    // Detalle: la misma hora.
    await card.getByRole('button', { name: new RegExp(`^Detalle de la cita de ${range}`) }).click();
    const sheet = page.getByRole('dialog', { name: futurePatient });
    await expect(sheet).toContainText(range);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Día · lista.
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.getByText(range).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await shoot(page, 'agenda-dia-lista', viewport.width);

    // Semana: la cita en la columna de SU día y con su hora.
    await openAgenda(page, 'Semana', futureDay);
    const weekCard = page.getByTestId('week-grid-appointment').filter({ hasText: futurePatient });
    await expect(weekCard).toHaveAccessibleName(new RegExp(`^${range}`), { timeout: 15_000 });
    await expect(page.locator(`[data-testid="week-grid-day-column"]`).filter({ has: weekCard })).toHaveCount(1);
    const columns = page.getByTestId('week-grid-day-column');
    const headers = page.getByTestId('week-day-header');
    const index = await headers.evaluateAll(
      (els, day) => els.findIndex((el) => el.getAttribute('data-date') === day),
      futureDay,
    );
    await expect(columns.nth(index).getByTestId('week-grid-appointment')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await shoot(page, 'agenda-semana', viewport.width);

    // Mes: la cita en la celda de su día de la sede (a 1440 px se ve la hora).
    await openAgenda(page, 'Mes', futureDay);
    const cell = page.locator(`[data-testid="calendar-day"][data-date="${futureDay}"]`);
    await expect(cell.getByTestId('month-appointment')).toHaveCount(1, { timeout: 15_000 });
    if (viewport.width === 1440) await expect(cell).toContainText(time);
    await expectNoHorizontalScroll(page);
    await shoot(page, 'agenda-mes', viewport.width);
  }
});

test('una cita de hoy que llegó sale con la misma hora en la agenda y en «En clínica»', async ({ page, request }) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(120_000);
  // La API no agenda en el pasado: se crea mañana y, por la BD, se pasa a hoy
  // (día de la sede) y ya empezada, como en regional-format.spec.ts.
  const now = new Date();
  const today = wallDay(now, SEDE.timeZone);
  const start = new Date(
    Math.max(wallInstant(today, 5, SEDE.timeZone).getTime(), Math.floor((now.getTime() - 30 * MIN) / MIN) * MIN),
  );
  expect(start.getTime(), `ya no queda margen hoy en ${SEDE.timeZone}: vuelve a lanzar el spec`).toBeLessThan(
    now.getTime() - MIN,
  );
  const [first, last] = todayPatient.split(' ');
  const patient = await newPatient(request, first, last);
  const tomorrow = wallInstant(addCivilDays(today, 1), 10 * 60, SEDE.timeZone);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: tomorrow.toISOString(),
    end: new Date(tomorrow.getTime() + 15 * MIN).toISOString(),
  });
  execFileSync('psql', [
    process.env.E2E_DATABASE_URL as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE appointments SET start = '${start.toISOString()}', "end" = '${new Date(start.getTime() + 15 * MIN).toISOString()}' WHERE id = '${appointment.id}'`,
  ]);
  const arrived = await request.patch(`${API_URL}/appointments/${appointment.id}`, {
    headers: session.headers,
    data: { status: 'ARRIVED' },
  });
  expect(arrived.ok(), await arrived.text()).toBeTruthy();
  const time = fmt.time(start, SEDE.timeZone);

  await loginAs(page, origin, adminEmail, password);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAgenda(page, 'Día', today);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: todayPatient });
  await expect(row).toContainText(`${time} – `, { timeout: 15_000 });

  await page.goto(`${origin}/agenda/en-clinica`);
  const main = page.getByRole('main');
  const panelRow = main.locator('[data-appointment-id]').filter({ hasText: todayPatient });
  await expect(panelRow).toContainText(`Cita ${time}`, { timeout: 15_000 });
});

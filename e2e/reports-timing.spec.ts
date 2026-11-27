import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { addDays, atSede, sedeDayFromToday, sedeWeekdayFromToday } from './support/clock';
import { backdateTimedAppointment } from './support/db';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-275 — «Reportes» → «Tiempos» y la marca de «En clínica», sin mocks,
 * en una clínica nueva (una sede). Las citas se crean por la API en un día
 * hábil futuro y se pasan a ATENDIDAS en días hábiles pasados, con sus horas
 * del panel, por SQL (`backdateTimedAppointment`): la API no agenda pasado.
 * Todas de 30 min agendados, llegada 5 min antes de la hora y 40 min en el
 * sillón salvo la del odontólogo (30):
 *  - ADMIN: sillón a los 10, 20 y 30 min de la hora; una más atendida sin horas;
 *  - DENTIST: sillón a los 6 min.
 *  → ADMIN (toda la clínica): 5 atendidas, 4 con tiempos, «1 cita sin tiempos»;
 *    espera media (6 + 10 + 20 + 30) ÷ 4 = 16,5 min, p90 27 min.
 *  → DENTIST: 1 atendida, espera 6 min, sin aviso de citas sin tiempos.
 * Y hoy, una cita de la ADMIN completada sin horas: «1 cita de hoy sin tiempos» en el panel.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const subdomain = `test-tiempos-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Tiempos Titular', email: `tiempos.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Tiempos Odontólogo', email: `tiempos.od.${suffix}@example.com` };
const reception = { fullName: 'Recepción Tiempos', email: `tiempos.rec.${suffix}@example.com` };
const LAST = `Cronos${suffix}`;
const MIN = 60_000;
const FROM = sedeDayFromToday(-30);
const TO = sedeDayFromToday(-1);
const URL = `/reportes?tab=tiempos&periodo=custom&desde=${FROM}&hasta=${TO}`;
const FUTURE = sedeWeekdayFromToday(14);

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let adminId: string;
let dentistId: string;

/** El día hábil (lunes a viernes) `days` días o más ANTES de hoy. */
function pastWeekday(days: number): string {
  for (let day = sedeDayFromToday(-days); ; day = addDays(day, -1)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}

let slot = 0;
function futureSlot(): { start: Date; end: Date } {
  const minutes = 7 * 60 + slot * 30;
  slot += 1;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const start = atSede(FUTURE, hhmm);
  return { start, end: new Date(start.getTime() + 30 * MIN) };
}

async function patient(request: APIRequestContext, firstName: string, n: number): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: LAST,
    docType: 'NATIONAL_ID',
    docNumber: `TIM${n}${suffix}`.slice(0, 20),
    sex: 'F',
    phone: `+58 412 555 ${String(200 + n).padStart(4, '0')}`,
  });
  return id;
}

/**
 * Una cita de `providerId` atendida el día `day` a las 09:00 (30 min). Con
 * `seatedAfter`, llegó 5 min antes, pasó al sillón a los `seatedAfter` min de
 * la hora y estuvo `chairMinutes` en él; sin él, sin ninguna hora.
 */
async function attended(
  request: APIRequestContext,
  n: number,
  providerId: string,
  day: string,
  hhmm: string,
  timing: { seatedAfter: number; chairMinutes: number } | null,
): Promise<string> {
  const patientId = await patient(request, `Paciente${n}`, n);
  const future = futureSlot();
  const { id } = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId,
    start: future.start.toISOString(),
    end: future.end.toISOString(),
  });
  const start = atSede(day, hhmm);
  const end = new Date(start.getTime() + 30 * MIN);
  const seatedAt = timing ? new Date(start.getTime() + timing.seatedAfter * MIN) : null;
  backdateTimedAppointment(id, start, end, {
    arrivedAt: timing ? new Date(start.getTime() - 5 * MIN) : null,
    seatedAt,
    readyForCheckoutAt: timing && seatedAt ? new Date(seatedAt.getTime() + timing.chairMinutes * MIN) : null,
  });
  return id;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Tiempos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok(), `horario: ${await schedule.text()}`).toBeTruthy();
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  adminId = staff.find((m) => m.fullName === admin.fullName)!.userId;
  dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;

  const d1 = pastWeekday(3);
  const d2 = pastWeekday(8);
  await attended(request, 1, adminId, d1, '09:00', { seatedAfter: 10, chairMinutes: 40 });
  await attended(request, 2, adminId, d1, '10:00', { seatedAfter: 20, chairMinutes: 40 });
  await attended(request, 3, adminId, d2, '09:00', { seatedAfter: 30, chairMinutes: 40 });
  await attended(request, 4, adminId, d2, '11:00', null);
  await attended(request, 5, dentistId, d1, '09:00', { seatedAfter: 6, chairMinutes: 30 });
  // Hoy (el día del panel), completada sin pasar por «Llegó»: la marca de «En clínica».
  await attended(request, 6, adminId, sedeDayFromToday(0), '00:30', null);
});

async function open(page: Page, email = admin.email, url = URL): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}${url}`);
}

const flat = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

test('1440 px ADMIN: totales, «1 cita sin tiempos», tablas, definiciones y el CSV', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByRole('tab', { name: 'Tiempos', selected: true })).toBeVisible({ timeout: 30_000 });
  const wait = page.getByTestId('timing-total-wait');
  await expect(wait).toContainText('16,5 min', { timeout: 30_000 });
  await expect(wait).toContainText('p90 27 min');
  await expect(page.getByTestId('timing-total-completed')).toContainText('5');
  await expect(page.getByTestId('timing-total-completed')).toContainText('4 con tiempos válidos');
  await expect(page.getByTestId('timing-excluded')).toContainText('1 cita sin tiempos');
  const pros = page.getByRole('table', { name: 'Tiempos por profesional' });
  await expect(pros.getByRole('row').filter({ hasText: admin.fullName })).toContainText('20 min');
  await expect(pros.getByRole('row').filter({ hasText: dentist.fullName })).toContainText('6 min');
  await expect(page.getByRole('table', { name: 'Tiempos por tipo de cita' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Tiempos por semana' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Horas y ocupación por profesional' })).toBeVisible();
  await expect(page.getByTestId('timing-definitions').getByRole('term')).toHaveCount(15);
  await expect(page.getByTestId('timing-definition-wait')).toContainText('Espera en sala');
  await expect(page.getByLabel('Profesional', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'tiempos', 1440);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`tiempos-de-agenda-${FROM}-${TO}.csv`);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('Tiempos de la agenda');
  expect(csv).toContain(admin.fullName);
  await expect(page.getByText('Informe descargado.')).toBeVisible();
  await page.getByTestId('timing-by-type').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-tipos-semanas', 1440);
  await page.getByText(`${admin.fullName} · por semana`).click();
  await expect(page.getByRole('table', { name: `Ocupación de ${admin.fullName} por semana` })).toBeVisible();
  await page.getByTestId('timing-definitions').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-ocupacion-definiciones', 1440);
});

test('390 px ADMIN: sin scroll horizontal de la página; las tablas se desplazan dentro de su marco', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByTestId('timing-total-wait')).toContainText('16,5 min', { timeout: 30_000 });
  await expect(page.getByRole('table', { name: 'Tiempos por profesional' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'tiempos', 390);
  await page.getByTestId('timing-total-occupancy').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-totales', 390);
  await page.getByTestId('timing-by-professional').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-tablas', 390);
  await page.getByTestId('timing-occupancy').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-ocupacion', 390);
  await page.getByTestId('timing-definitions').scrollIntoViewIfNeeded();
  await shot(page, 'tiempos-definiciones', 390);
});

test('axe: el informe a 390 y 1440 px, en claro y oscuro', async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    if (width === 1440) await open(page);
    else await page.goto(`${session.origin}${URL}`);
    await expect(page.getByTestId('timing-total-wait')).toContainText('16,5 min', { timeout: 30_000 });
    const report = await axeInBothThemes(page, page.locator('body'));
    expect(report, `informe @ ${width}`).toEqual({ light: [], dark: [] });
  }
});

test('DENTIST: la pestaña con solo lo suyo y sin selector de profesional; la API le niega otro', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, dentist.email);
  await expect(page.getByRole('tab', { name: 'Tiempos', selected: true })).toBeVisible({ timeout: 30_000 });
  const wait = page.getByTestId('timing-total-wait');
  await expect(wait).toContainText('6 min', { timeout: 30_000 });
  expect(flat(await page.getByTestId('timing-total-completed').textContent())).toContain('1');
  await expect(page.getByTestId('timing-scope')).toContainText('Solo lo tuyo');
  await expect(page.getByTestId('timing-excluded')).toHaveCount(0);
  await expect(page.getByLabel('Profesional', { exact: true })).toHaveCount(0);
  const pros = page.getByRole('table', { name: 'Tiempos por profesional' });
  await expect(pros.getByRole('row').filter({ hasText: admin.fullName })).toHaveCount(0);
  await shot(page, 'tiempos-odontologo', 1440);
  const dentistSession = await apiLogin(request, session.origin, dentist.email, password);
  const res = await request.get(`${API_URL}/reports/timing?from=${FROM}&to=${TO}&providerId=${adminId}`, {
    headers: dentistSession.headers,
  });
  expect(res.status()).toBe(403);
});

test('recepción: sin la pestaña; por URL cae en la suya y la API le responde 403', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, reception.email);
  // Una sola pestaña («Cobrado sin imputar»): sin barra, y nada de «Tiempos».
  await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Tiempos' })).toHaveCount(0);
  await expect(page.getByTestId('timing-total-wait')).toHaveCount(0);
  const receptionSession = await apiLogin(request, session.origin, reception.email, password);
  for (const path of ['/reports/timing', '/reports/timing.csv']) {
    const res = await request.get(`${API_URL}${path}?from=${FROM}&to=${TO}`, { headers: receptionSession.headers });
    expect(res.status(), path).toBe(403);
  }
});

test('«En clínica»: la cita de hoy atendida sin horas lleva su marca, con lo que le falta', async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    if (width === 1440) await open(page, admin.email, '/agenda/en-clinica');
    else await page.goto(`${session.origin}/agenda/en-clinica`);
    const count = page.getByTestId('in-clinic-without-times-count');
    await expect(count).toHaveText('1 cita de hoy sin tiempos', { timeout: 30_000 });
    await count.click();
    const item = page.getByTestId('in-clinic-without-times-item');
    await expect(item).toContainText(`Paciente6 ${LAST}`);
    await expect(item).toContainText('Falta: llegada, sillón, listo para cobrar');
    await expectNoHorizontalScroll(page);
    await item.scrollIntoViewIfNeeded();
    await shot(page, 'en-clinica-sin-tiempos', width);
    const report = await axeInBothThemes(page, page.locator('body'));
    expect(report, `en clínica @ ${width}`).toEqual({ light: [], dark: [] });
  }
});

import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { atSede, sedeDayFromToday, sedeWeekdayFromToday } from './support/clock';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { backdateCompletedAppointment } from './support/db';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-260 — «Reportes» → «Retención», sin mocks, con los datos semilla del
 * ticket en una clínica nueva (una sede, la ADMIN atiende a todos; ventana de
 * actividad de 18 meses por defecto). Período: de hace 180 días a ayer.
 *  - 8 conservados: una visita hace 300 días (activos al inicio y al final);
 *  - 2 perdidos: una visita hace 640 días (activos al inicio, no al final);
 *    uno de ellos con la baja de avisos (DX-128);
 *  - 3 nuevos: uno sin regreso (una visita hace 150 días), otro que volvió a
 *    los 30 días y otro de hace 60 días con una cita futura agendada.
 *  → 10 activos al inicio, 3 nuevos, 2 perdidos, 11 activos al final, 1 nuevo
 *    sin regreso y retención ((11 − 3) ÷ 10) = 80 %.
 * Las citas se crean por la API en el futuro y se pasan a ATENDIDAS en el
 * pasado por SQL (`backdateCompletedAppointment`): la API no agenda pasado.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const subdomain = `test-retencion-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Retención Titular', email: `retencion.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Retención Odontólogo', email: `retencion.od.${suffix}@example.com` };
const LAST = `Retenido${suffix}`;
const MIN = 60_000;
const FROM = sedeDayFromToday(-180);
const TO = sedeDayFromToday(-1);
const URL = `/reportes?tab=retencion&periodo=custom&desde=${FROM}&hasta=${TO}`;
// Las citas nacen en un día hábil futuro, cada una en su media hora.
const FUTURE = sedeWeekdayFromToday(14);

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let adminId: string;
const lostName = `Lucía ${LAST}`;
const optedOutName = `Óscar ${LAST}`;

let slot = 0;
function nextSlot(day: string): { start: Date; end: Date } {
  const minutes = 6 * 60 + slot * 30;
  slot += 1;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const start = atSede(day, hhmm);
  return { start, end: new Date(start.getTime() + 30 * MIN) };
}

async function patient(request: APIRequestContext, firstName: string, n: number): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: LAST,
    docType: 'NATIONAL_ID',
    docNumber: `RET${n}${suffix}`.slice(0, 20),
    sex: 'F',
    phone: `+58 412 555 ${String(100 + n).padStart(4, '0')}`,
  });
  return id;
}

/** Una cita agendada en `FUTURE`; con `daysAgo`, pasada a ATENDIDA ese día. */
async function visit(request: APIRequestContext, patientId: string, daysAgo?: number): Promise<void> {
  const future = nextSlot(FUTURE);
  const { id } = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId: adminId,
    start: future.start.toISOString(),
    end: future.end.toISOString(),
  });
  if (daysAgo !== undefined) {
    const past = nextSlot(sedeDayFromToday(-daysAgo));
    backdateCompletedAppointment(id, past.start, past.end);
  }
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Retencion ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  // Sin horario la sede no restringe días ni horas (como DX-304).
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok(), `horario: ${await schedule.text()}`).toBeTruthy();
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  adminId = staff.find((m) => m.fullName === admin.fullName)!.userId;

  let n = 0;
  for (let i = 1; i <= 8; i++) await visit(request, await patient(request, `Conservado${i}`, ++n), 300);
  await visit(request, await patient(request, 'Lucía', ++n), 640);
  const optedOut = await patient(request, 'Óscar', ++n);
  await visit(request, optedOut, 640);
  const optOut = await request.patch(`${API_URL}/patients/${optedOut}/communication`, {
    headers: session.headers,
    data: { reminderOptOut: true },
  });
  expect(optOut.ok(), `baja de avisos: ${await optOut.text()}`).toBeTruthy();
  await visit(request, await patient(request, 'Nora', ++n), 150);
  const back = await patient(request, 'Nelson', ++n);
  await visit(request, back, 150);
  await visit(request, back, 120);
  const booked = await patient(request, 'Natalia', ++n);
  await visit(request, booked, 60);
  await visit(request, booked); // cita futura agendada
});

async function open(page: Page, email = admin.email): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}${URL}`);
}

async function expectFigures(page: Page): Promise<void> {
  await expect(page.getByTestId('retention-figure-retentionRate')).toContainText(/80\s?%/, { timeout: 30_000 });
  await expect(page.getByTestId('retention-open-active_start')).toHaveText('10');
  await expect(page.getByTestId('retention-open-new')).toHaveText('3');
  await expect(page.getByTestId('retention-open-lost')).toHaveText('2');
  await expect(page.getByTestId('retention-open-active_end')).toHaveText('11');
  await expect(page.getByTestId('retention-open-new_no_return')).toHaveText('1');
  await expect(page.getByTestId('retention-value-reactivated')).toHaveText('0');
}

test('1440 px ADMIN: las cifras del ticket, cada lista con sus filas, baja de avisos sin contacto y «Agendar»', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByRole('tab', { name: 'Retención', selected: true })).toBeVisible({ timeout: 30_000 });
  await expectFigures(page);
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
  const table = page.getByRole('table', { name: 'Retención por sede y profesional' });
  await expect(table.getByRole('row').filter({ hasText: admin.fullName })).toContainText(/80\s?%/);
  await expectNoHorizontalScroll(page);
  await shot(page, 'retencion', 1440);

  // Perdidos: 2 filas = la cifra; la baja de avisos sin teléfono ni WhatsApp.
  await page.getByTestId('retention-open-lost').click();
  const dialog = page.getByRole('dialog', { name: 'Perdidos' });
  const list = dataList(dialog, 'Pacientes: Perdidos');
  await expect(dataListRows(list)).toHaveCount(3, { timeout: 30_000 }); // cabecera + 2
  const lucia = list.getByRole('row').filter({ hasText: lostName });
  await expect(lucia.locator('a[href^="https://wa.me/"]')).toHaveCount(1);
  await expect(lucia.locator('a[href^="tel:"]')).toHaveCount(1);
  const oscar = list.getByRole('row').filter({ hasText: optedOutName });
  await expect(oscar.getByTestId('retention-opted-out')).toHaveText('No quiere avisos');
  await expect(oscar.locator('a[href^="https://wa.me/"], a[href^="tel:"]')).toHaveCount(0);
  await expect(dialog.getByTestId('retention-opted-out-why')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Exportar lista' })).toBeEnabled();
  await shot(page, 'retencion-perdidos', 1440);
  await page.keyboard.press('Escape');

  // Cada cifra abre tantas filas como dice.
  for (const [segment, label, count] of [
    ['active_start', 'Activos al inicio', 10],
    ['new', 'Nuevos', 3],
    ['active_end', 'Activos al final', 11],
  ] as const) {
    await page.getByTestId(`retention-open-${segment}`).click();
    const d = page.getByRole('dialog', { name: label });
    await expect(dataListRows(dataList(d, `Pacientes: ${label}`))).toHaveCount(count + 1, { timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
  }

  // Nuevos sin regreso → «Agendar» abre la cita con el paciente puesto.
  await page.getByTestId('retention-open-new_no_return').click();
  const noReturn = page.getByRole('dialog', { name: 'Nuevos sin regreso' });
  const rows = dataList(noReturn, 'Pacientes: Nuevos sin regreso');
  const nora = rows.getByRole('row').filter({ hasText: `Nora ${LAST}` });
  await expect(nora).toBeVisible({ timeout: 30_000 });
  await rowAction(page, nora, 'Agendar');
  const schedule = page.getByRole('dialog', { name: 'Agendar cita' });
  await expect(schedule).toContainText(`Nora ${LAST}`, { timeout: 30_000 });
  await expect(schedule.getByRole('button', { name: 'Agendar cita' })).toBeVisible();
  await shot(page, 'retencion-agendar', 1440);
});

test('390 px ADMIN: tarjetas sin scroll horizontal; la lista de perdidos con la baja de avisos', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expectFigures(page);
  await expect(page.getByRole('list', { name: 'Retención por sede y profesional' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'retencion', 390);
  await page.getByTestId('retention-open-lost').click();
  const dialog = page.getByRole('dialog', { name: 'Perdidos' });
  const cards = dialog.getByRole('list', { name: 'Pacientes: Perdidos' });
  await expect(cards.getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
  await expect(cards.getByRole('listitem').filter({ hasText: optedOutName })).toContainText('No quiere avisos');
  await shot(page, 'retencion-perdidos', 390);
});

test('axe: el informe y la lista a 390 y 1440 px, en claro y oscuro', async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    if (width === 1440) await open(page);
    else await page.goto(`${session.origin}${URL}`);
    await expectFigures(page);
    const report = await axeInBothThemes(page, page.locator('body'));
    expect(report, `informe @ ${width}`).toEqual({ light: [], dark: [] });
    await page.getByTestId('retention-open-lost').click();
    const dialog = page.getByRole('dialog', { name: 'Perdidos' });
    await expect(dataListRows(dataList(dialog, 'Pacientes: Perdidos')).filter({ hasText: lostName })).toBeVisible({
      timeout: 30_000,
    });
    const list = await axeInBothThemes(page, page.locator('body'));
    expect(list, `lista @ ${width}`).toEqual({ light: [], dark: [] });
    await page.keyboard.press('Escape');
  }
});

test('un clínico no ve la pestaña y la API le responde 403', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, dentist.email);
  // `?tab=retencion` fuera de sus pestañas cae en su primera.
  await expect(page.getByRole('tab', { name: 'Producción por procedimiento', selected: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('tab', { name: 'Retención' })).toHaveCount(0);
  const dentistSession = await apiLogin(request, session.origin, dentist.email, password);
  const res = await request.get(`${API_URL}/reports/retention?from=${FROM}&to=${TO}`, {
    headers: dentistSession.headers,
  });
  expect(res.status()).toBe(403);
});

import { test, expect, type APIRequestContext, type Page } from './support/test';
import { fillDate, fillTime } from './support/dates';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import {
  expectDialogInsideViewport,
  expectNoHorizontalOverflowInDialog,
  expectNoHorizontalScroll,
} from './support/layout';
import { shot } from './support/qa-shot';
import { chooseAppointmentStatus } from './support/appointment-status';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-267 / DX-267-bis: el horario del profesional que deja citas fuera
 * pide confirmar, y reactivar una cita pasa por las reglas de mover.
 *
 * Una clínica nueva por corrida, una sede abierta de lunes a sábado de 07:00
 * a 20:00 y una odontóloga, «Olga Afectada», que atiende los jueves de 14:00
 * a 19:00 (por API). Dos citas suyas por API, J1 y J2 (dos jueves), a las
 * 15:00. En serie:
 * 1. excepción «no trabaja» el día de J1: el diálogo la enseña; «Volver» no
 *    guarda nada; «Guardar de todos modos» guarda y la cita sigue agendada;
 * 2. semanal sin jueves (con viernes): el diálogo, guardar, citas intactas;
 * 3. 390 px: un cambio real (el viernes empieza más tarde que una cita) abre
 *    el diálogo, que cabe en la pantalla sin desplazarse en horizontal;
 * 4. reactivar una cita cancelada con un bloqueo creado después: el mensaje
 *    del bloqueo, y sigue cancelada;
 * 5. reactivar una cita cancelada fuera del horario del profesional (sin
 *    modo estricto): se reactiva con el aviso.
 * QA visual con `shot()` (E2E_QA_DIR) a 390 y 1440 en claro y oscuro.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `afectadas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.afectadas.${suffix}@example.com` };
const dentist = { fullName: 'Olga Afectada', email: `olga.${suffix}@example.com` };
const patientLast = `Afectado${suffix}`.slice(0, 40);
const patientName = `Bruno ${patientLast}`;

/** El primer lunes a partir de `minDays` días desde hoy (en la sede). */
function mondayFrom(minDays: number): string {
  for (let i = minDays; i < minDays + 7; i++) {
    const day = sedeDayFromToday(i);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 1) return day;
  }
  throw new Error('sin lunes');
}

function plusDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONDAY = mondayFrom(7);
const J1 = plusDays(MONDAY, 3);
const J2 = plusDays(MONDAY, 10);
/** Viernes de la semana de J1: la cita del test de 390 px. */
const FRIDAY_390 = plusDays(MONDAY, 4);
/** Viernes tras J2: dentro del semanal nuevo (14:00–19:00). */
const BLOCK_FRIDAY = plusDays(MONDAY, 11);
/** Martes tras J2: no trabaja ese día. */
const OFF_TUESDAY = plusDays(MONDAY, 15);

let session: ApiSession;
let sedeId = '';
let sedeName = '';
let dentistId = '';
let patientId = '';
let j1Id = '';
let j2Id = '';

test.describe.configure({ mode: 'serial' });

async function bookViaApi(request: APIRequestContext, day: string, from: string, to: string): Promise<string> {
  const created = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId: dentistId,
    start: atSede(day, from).toISOString(),
    end: atSede(day, to).toISOString(),
  });
  return created.id;
}

async function cancelViaApi(request: APIRequestContext, id: string): Promise<void> {
  const res = await request.patch(`${API_URL}/appointments/${id}`, {
    headers: session.headers,
    data: { status: 'CANCELLED', cancelledByKind: 'CLINIC', cancelReasonCode: 'CLINIC_RESCHEDULE' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function statusOf(request: APIRequestContext, id: string): Promise<string> {
  const res = await request.get(`${API_URL}/appointments/${id}`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { status: string }).status;
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Afectadas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string; name: string }[])[0];
  sedeId = principal.id;
  sedeName = principal.name;
  const openWeek = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 7 * 60, endMinute: 20 * 60 }));
  const hours = await request.put(`${API_URL}/locations/schedule`, {
    headers: { ...session.headers, 'X-Location-Id': sedeId },
    data: { ranges: openWeek },
  });
  expect(hours.ok(), await hours.text()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  dentistId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === dentist.fullName,
  )!.userId;
  const weekly = await request.put(`${API_URL}/providers/${dentistId}/schedule`, {
    headers: session.headers,
    data: { locations: [{ locationId: sedeId, ranges: [{ weekday: 4, startMinute: 14 * 60, endMinute: 19 * 60 }] }] },
  });
  expect(weekly.ok(), await weekly.text()).toBeTruthy();
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Bruno',
      lastName: patientLast,
      docType: 'NATIONAL_ID',
      docNumber: `AFE${suffix}`.slice(0, 20),
      sex: 'M',
    })
  ).id;
  j1Id = await bookViaApi(request, J1, '15:00', '15:30');
  j2Id = await bookViaApi(request, J2, '15:00', '15:30');
});

async function openScheduleEditor(page: Page) {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/horarios?tab=profesionales`);
  await page.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await expect(page.getByRole('button', { name: 'Añadir excepción' })).toBeVisible({ timeout: 10_000 });
}

test('excepción que deja una cita fuera: «Volver» no guarda; «Guardar de todos modos» guarda y la cita sigue agendada', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openScheduleEditor(page);

  await page.getByRole('button', { name: 'Añadir excepción' }).click();
  const overrideDialog = page.getByRole('dialog', { name: 'Nueva excepción' });
  await overrideDialog.getByLabel('Sede', { exact: true }).selectOption({ label: sedeName });
  await fillDate(overrideDialog, 'Fecha', J1);
  await expect(overrideDialog.getByRole('checkbox', { name: 'No trabaja ese día en esta sede' })).toBeChecked();
  await overrideDialog.getByRole('button', { name: 'Guardar excepción' }).click();

  const affected = page.getByRole('dialog', { name: '1 cita queda fuera de este horario' });
  await expect(affected).toBeVisible({ timeout: 10_000 });
  const rows = affected.getByTestId('affected-appointments');
  await expect(rows).toContainText(patientName);
  await expect(rows).toContainText('15:00');
  await shot(page, 'dx267-affected-override', 1440);

  // «Volver»: no se guarda nada y se vuelve al formulario de la excepción.
  await affected.getByRole('button', { name: 'Volver' }).click();
  await expect(affected).toBeHidden();
  await expect(overrideDialog).toBeVisible();
  const none = await request.get(`${API_URL}/providers/${dentistId}/schedule-overrides?from=${J1}&to=${J1}`, {
    headers: session.headers,
  });
  expect(none.ok(), await none.text()).toBeTruthy();
  expect(await none.json()).toEqual([]);

  // Otra vez, y ahora se guarda a sabiendas.
  await overrideDialog.getByRole('button', { name: 'Guardar excepción' }).click();
  await expect(affected).toBeVisible({ timeout: 10_000 });
  await affected.getByRole('button', { name: 'Guardar de todos modos' }).click();
  await expect(affected).toBeHidden({ timeout: 10_000 });
  await expect(overrideDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('list', { name: 'Excepciones por fecha' })).toContainText(`${sedeName} · No trabaja`);
  expect(await statusOf(request, j1Id)).toBe('SCHEDULED');
});

test('semanal que deja citas fuera: el diálogo, «Guardar de todos modos» y las citas intactas', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openScheduleEditor(page);

  // Del jueves al viernes, mismo tramo.
  const jueves = page.getByRole('group', { name: 'Jueves', exact: true });
  await jueves.getByRole('button', { name: `Quitar tramo, Jueves, ${sedeName}, tramo 1` }).click();
  const viernes = page.getByRole('group', { name: 'Viernes', exact: true });
  await viernes.getByRole('button', { name: `Agregar tramo en ${sedeName}` }).click();
  await fillTime(viernes, `Desde, Viernes, ${sedeName}, tramo 1`, '14:00');
  await fillTime(viernes, `Hasta, Viernes, ${sedeName}, tramo 1`, '19:00');
  await page.getByRole('button', { name: 'Guardar horario' }).click();

  const affected = page.getByRole('dialog', { name: /^(1 cita queda|\d+ citas quedan) fuera de este horario$/ });
  await expect(affected).toBeVisible({ timeout: 10_000 });
  await expect(affected.getByTestId('affected-appointments')).toContainText(patientName);
  await shot(page, 'dx267-affected-weekly', 1440);
  await affected.getByRole('button', { name: 'Guardar de todos modos' }).click();
  await expect(affected).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('Horario guardado.', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  expect(await statusOf(request, j1Id)).toBe('SCHEDULED');
  expect(await statusOf(request, j2Id)).toBe('SCHEDULED');
});

test('390 px: un cambio real del horario abre el diálogo, que cabe en la pantalla sin scroll horizontal', async ({
  page,
  request,
}) => {
  // Fuera de juego las citas que ya quedaron fuera (J1 y J2): el diálogo
  // solo puede salir por el cambio de este test.
  await cancelViaApi(request, j1Id);
  await cancelViaApi(request, j2Id);
  // Una cita del viernes a las 15:00, dentro del semanal (14:00–19:00).
  const carla = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Carla',
    lastName: patientLast,
    docType: 'NATIONAL_ID',
    docNumber: `AFC${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const fridayId = (
    await apiPost<{ id: string }>(request, session, '/appointments', {
      patientId: carla.id,
      providerId: dentistId,
      start: atSede(FRIDAY_390, '15:00').toISOString(),
      end: atSede(FRIDAY_390, '15:30').toISOString(),
    })
  ).id;

  await page.setViewportSize({ width: 390, height: 844 });
  await openScheduleEditor(page);

  // El viernes empieza a las 16:00: la cita de las 15:00 queda fuera.
  const viernes = page.getByRole('group', { name: 'Viernes', exact: true });
  await viernes.getByRole('button', { name: /^Viernes/ }).click();
  await fillTime(viernes, `Desde, Viernes, ${sedeName}, tramo 1`, '16:00');
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  const affected = page.getByRole('dialog', { name: '1 cita queda fuera de este horario' });
  await expect(affected).toBeVisible({ timeout: 10_000 });
  await expect(affected.getByTestId('affected-appointments')).toContainText(`Carla ${patientLast}`);
  await expectDialogInsideViewport(page, affected);
  await expectNoHorizontalOverflowInDialog(affected);
  await expectNoHorizontalScroll(page);
  await shot(page, 'dx267-affected-weekly', 390);
  await affected.getByRole('button', { name: 'Volver' }).click();
  await expect(affected).toBeHidden();

  // La excepción, igual: ese viernes «no trabaja».
  await page.getByRole('button', { name: 'Añadir excepción' }).click();
  const overrideDialog = page.getByRole('dialog', { name: 'Nueva excepción' });
  await fillDate(overrideDialog, 'Fecha', FRIDAY_390);
  await overrideDialog.getByRole('button', { name: 'Guardar excepción' }).click();
  const overrideAffected = page.getByRole('dialog', { name: '1 cita queda fuera de este horario' });
  await expect(overrideAffected).toBeVisible({ timeout: 10_000 });
  await expect(overrideAffected.getByTestId('affected-appointments')).toContainText(`Carla ${patientLast}`);
  await expectDialogInsideViewport(page, overrideAffected);
  await expectNoHorizontalOverflowInDialog(overrideAffected);
  await expectNoHorizontalScroll(page);
  await shot(page, 'dx267-affected-override', 390);
  await overrideAffected.getByRole('button', { name: 'Volver' }).click();
  await expect(overrideAffected).toBeHidden();
  expect(await statusOf(request, fridayId)).toBe('SCHEDULED');
});

async function reactivateInList(page: Page, day: string) {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: patientLast });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await chooseAppointmentStatus(row.getByTestId('appointment-status-select'), 'Agendada');
}

test('DX-267-bis: reactivar una cita con un bloqueo creado después da el mensaje del bloqueo', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await bookViaApi(request, BLOCK_FRIDAY, '15:00', '15:30');
  await cancelViaApi(request, id);
  // Tras cancelarla, vacaciones de la odontóloga ese día.
  await apiPost(request, session, '/schedule-blocks', {
    providerId: dentistId,
    start: atSede(BLOCK_FRIDAY, '07:00').toISOString(),
    end: atSede(BLOCK_FRIDAY, '20:00').toISOString(),
    kind: 'VACATION',
  });

  await reactivateInList(page, BLOCK_FRIDAY);
  await expect(page.getByText(/La agenda del profesional está bloqueada \(Vacaciones\)/)).toBeVisible({
    timeout: 10_000,
  });
  expect(await statusOf(request, id)).toBe('CANCELLED');
});

test('DX-267-bis: reactivar una cita fuera del horario del profesional la reactiva con el aviso', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // El martes no trabaja: agendarla ya avisa (sin modo estricto), y se cancela.
  const id = await bookViaApi(request, OFF_TUESDAY, '10:00', '10:30');
  await cancelViaApi(request, id);

  await reactivateInList(page, OFF_TUESDAY);
  await expect(page.getByText('Cita fuera del horario del profesional')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Fuera del horario del profesional: no trabaja en /)).toBeVisible();
  await expect.poll(() => statusOf(request, id)).toBe('SCHEDULED');
});

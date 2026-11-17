import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ, atSede, sedeDayFromToday } from './support/clock';
import { E2E_TODAY_REGION } from './support/regional';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e DX-566 · Control postoperatorio.
 *
 * Una clínica nueva por corrida (sede en `SEDE_TODAY_TZ`, sin horario), con
 * odontóloga y recepción.
 *  1. ADMIN marca en el catálogo una extracción con control a 1 día (UI).
 *  2. Siembra por la API: dos pacientes con un plan aceptado de esa
 *     extracción, una cita ligada que se mueve a hoy por la BD (la API no
 *     agenda en el pasado), atendida (COMPLETED), con su evolución, y el ítem
 *     DONE desde esa cita. El control nace para el siguiente día hábil: la BD
 *     lo pone para hoy (la guarda deja cambiar la fecha de un PENDING).
 *  3. Recepción ve la lista sin procedimiento ni «Registrar resultado».
 *  4. 1440 px: la odontóloga registra «No contesta» (1 intento) y luego
 *     «Bien»: la fila sale, «Mi día» baja al releer y la historia del
 *     paciente muestra el desenlace «Control postoperatorio».
 *  5. 390 px: «Necesita cita» abre el formulario de cita con el paciente, la
 *     odontóloga y el motivo «Revisión postoperatoria» puestos.
 * Sin E2E_DATABASE_URL los pasos 2–5 se saltan (e2e/allowed-skips.json).
 */
const suffix = randomUUID().slice(0, 8);
const PASSWORD = 'Password123!';
const admin = { fullName: 'Dueña Control', email: `postop.admin.${suffix}@example.com` };
const dentist = { fullName: 'Carmen Rojas', email: `postop.dentist.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `postop.recepcion.${suffix}@example.com` };
const ZONE = SEDE_TODAY_TZ;
const MIN = 60_000;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede poner hoy la cita ni el día del control';
const PROCEDURE = `Extracción ${suffix.slice(0, 6)}`;
const LIST_URL = '/agenda/controles-postoperatorios';

test.use({ timezoneId: ZONE });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let dentistSession: ApiSession;
let dentistId: string;
let locationId: string;
let catalogId: string;

interface Seeded {
  name: string;
  patientId: string;
  entryId: string;
}
let first: Seeded | null = null;
let second: Seeded | null = null;

function psql(sql: string, vars: Record<string, string>): void {
  const args = [process.env.E2E_DATABASE_URL as string, '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  // psql solo sustituye variables en lo que lee: el SQL entra por stdin.
  execFileSync('psql', args, { input: sql });
}

async function call<T>(request: APIRequestContext, s: ApiSession, method: 'get' | 'patch', path: string, data?: object) {
  const res = await request[method](`${API_URL}${path}`, {
    headers: { ...s.headers, 'X-Location-Id': locationId },
    ...(data ? { data } : {}),
  });
  expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Un paciente con la extracción hecha hoy en una cita atendida y su control para hoy. */
async function seedCheck(request: APIRequestContext, firstName: string, slot: number): Promise<Seeded> {
  const lastName = `Postop${suffix}`;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `PO${firstName.slice(0, 3)}${suffix}`.slice(0, 20),
    sex: 'M',
    phone: '+58 414 555 0101',
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '38',
    catalogItemId: catalogId,
  });
  await call(request, session, 'patch', `/treatment-plans/${plan.id}`, { status: 'ACCEPTED' });
  // La cita: mañana con la extracción; por la BD, hoy y ya empezada.
  const tomorrow = atSede(sedeDayFromToday(1, ZONE), `0${8 + slot}:00`, ZONE);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId: dentistId,
    start: tomorrow.toISOString(),
    end: new Date(tomorrow.getTime() + 30 * MIN).toISOString(),
    planItemIds: [item.id],
  });
  const start = new Date(Date.now() - (40 + 35 * slot) * MIN);
  psql(`UPDATE appointments SET start = :'start', "end" = :'end' WHERE id = :'id';`, {
    id: appointment.id,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * MIN).toISOString(),
  });
  await call(request, session, 'patch', `/appointments/${appointment.id}`, { status: 'COMPLETED' });
  const entry = await apiPost<{ id: string }>(request, dentistSession, `/patients/${patient.id}/clinical-entries`, {
    reason: 'Exodoncia del 38',
    notes: 'Exodoncia simple sin complicaciones.',
    appointmentId: appointment.id,
  });
  await call(request, dentistSession, 'patch', `/treatment-plans/${plan.id}/items/${item.id}`, {
    status: 'DONE',
    appointmentId: appointment.id,
  });
  // El control nace para el siguiente día hábil: que toque llamar hoy.
  psql(`UPDATE post_op_checks SET "dueOn" = :'day' WHERE "planItemId" = :'item' AND status = 'PENDING';`, {
    day: sedeDayFromToday(0, ZONE),
    item: item.id,
  });
  return { name: `${firstName} ${lastName}`, patientId: patient.id, entryId: entry.id };
}

async function openList(page: Page, email: string) {
  await loginAs(page, session.origin, email, PASSWORD);
  await page.goto(`${session.origin}${LIST_URL}`);
  await expect(page.getByRole('heading', { name: 'Controles postoperatorios', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

async function registerOutcome(page: Page, name: string, outcome: string, note?: string) {
  await page.getByRole('button', { name: `Acciones de ${name}` }).first().click();
  await page.getByRole('menuitem', { name: 'Registrar resultado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar resultado' });
  await dialog.getByLabel(outcome, { exact: true }).check();
  if (note) await dialog.getByLabel('Nota (opcional)', { exact: true }).fill(note);
  await dialog.getByRole('button', { name: /^Guardar/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain: `postop-${suffix}`,
    clinicName: `Clínica Control ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password: PASSWORD,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password: PASSWORD });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password: PASSWORD });
  dentistSession = await apiLogin(request, session.origin, dentist.email, PASSWORD);
  // Sin horario: la cita de mañana a las 08:00 cabe sea el día que sea.
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    id: string;
  }[];
  locationId = locations[0].id;
});

test('ADMIN marca en el catálogo una extracción con control a 1 día', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, session.origin, admin.email, PASSWORD);
  await page.goto(`${session.origin}/catalog`);
  await page.getByRole('button', { name: 'Agregar ítem' }).first().click({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Agregar ítem' });
  await dialog.getByLabel('Nombre', { exact: true }).fill(PROCEDURE);
  await dialog.getByLabel('Código', { exact: true }).fill(`EXO${suffix}`.slice(0, 20));
  await expect(dialog.getByLabel('Días después', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Pide control postoperatorio', { exact: true }).check();
  await expect(dialog.getByLabel('Días después', { exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const items = (await (
    await request.get(`${API_URL}/catalog/items?kind=PROCEDURE`, { headers: session.headers })
  ).json()) as { id: string; labelEs: string; requiresPostOpCheck: boolean; postOpCheckAfterDays: number }[];
  const created = items.find((i) => i.labelEs === PROCEDURE);
  expect(created).toMatchObject({ requiresPostOpCheck: true, postOpCheckAfterDays: 1 });
  catalogId = created!.id;
  // El alta por la pantalla no pone precio; sin él no entra en un presupuesto.
  const priced = await request.patch(`${API_URL}/catalog/items/${catalogId}`, {
    headers: session.headers,
    data: { defaultPrice: 40 },
  });
  expect(priced.ok(), await priced.text()).toBeTruthy();
});

test('RECEPTION ve a quién llamar, sin procedimiento ni «Registrar resultado» (390 y 1440 px)', async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(180_000);
  first = await seedCheck(request, 'Jorge', 0);
  second = await seedCheck(request, 'Pedro', 1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page, reception.email);
  const table = page.getByRole('table', { name: 'Controles por llamar' });
  const row = table.getByRole('row').filter({ hasText: first.name });
  await expect(row).toContainText('Vence hoy', { timeout: 15_000 });
  await expect(row.getByRole('link', { name: `Llamar a ${first.name} al +58 414 555 0101` })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Procedimiento' })).toHaveCount(0);
  await expect(table).not.toContainText(PROCEDURE);
  await row.getByRole('button', { name: `Acciones de ${first.name}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Abrir ficha' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Registrar resultado' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);

  // La Agenda enlaza la lista con su contador.
  await page.goto(`${session.origin}/agenda`);
  await expect(page.getByRole('link', { name: 'Controles postoperatorios · 2' })).toBeVisible({ timeout: 45_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${session.origin}${LIST_URL}`);
  await expect(page.getByRole('list', { name: 'Controles por llamar' })).toContainText(first.name, { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
});

test('1440 px: la odontóloga registra «No contesta» y luego «Bien»; sale, «Mi día» baja y queda en la historia', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(240_000);
  const s = first!;
  await page.setViewportSize({ width: 1440, height: 900 });

  // «Mi día» antes: los dos controles de hoy.
  await loginAs(page, session.origin, dentist.email, PASSWORD);
  await page.goto(`${session.origin}/dashboard`);
  const value = page.getByTestId('pending-post-op-checks-value');
  await expect(value).toHaveText('2', { timeout: 30_000 });

  await page.goto(`${session.origin}${LIST_URL}`);
  const table = page.getByRole('table', { name: 'Controles por llamar' });
  const row = table.getByRole('row').filter({ hasText: s.name });
  await expect(row).toContainText(PROCEDURE, { timeout: 15_000 });
  await expect(row).toContainText('Sin intentos');

  await registerOutcome(page, s.name, 'No contesta', 'Buzón de voz');
  await expect(page.getByText(`Intento 1 de 3 registrado para ${s.name}: sigue en la lista.`)).toBeVisible();
  await expect(row).toContainText('1 intento', { timeout: 15_000 });
  await expect(row).toContainText('No contesta · Carmen Rojas');
  await expect(row).toContainText('Buzón de voz');

  await registerOutcome(page, s.name, 'Bien', 'Sin dolor ni sangrado.');
  await expect(page.getByText(`Control de ${s.name} cerrado. Quedó en la historia clínica.`)).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: s.name })).toHaveCount(0, { timeout: 15_000 });
  await expectNoHorizontalScroll(page);

  // «Mi día» baja al releer (la API guarda el recuento hasta 30 s).
  await page.goto(`${session.origin}/dashboard`);
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('pending-post-op-checks-value')).toHaveText('1', { timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [5_000] });

  // El desenlace queda en la historia del paciente: como adenda de la
  // evolución (la cita tenía una) o como evolución propia «Control
  // postoperatorio» (sin ligar a la cita, para no tapar «Falta evolución»).
  await page.goto(`${session.origin}/patients/${s.patientId}?tab=clinical-history`);
  const history = page.locator('#tabpanel-clinical-history');
  await expect(history.getByText(/Control postoperatorio/).locator('visible=true').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(history.getByText(/Sin dolor ni sangrado\./).locator('visible=true').first()).toBeVisible();
});

test('390 px: «Necesita cita» cierra el control y abre la cita con el paciente, la odontóloga y el motivo', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(180_000);
  const s = second!;
  await page.setViewportSize({ width: 390, height: 844 });
  await openList(page, dentist.email);
  const list = page.getByRole('list', { name: 'Controles por llamar' });
  await expect(list).toContainText(s.name, { timeout: 15_000 });
  await expectNoHorizontalScroll(page);

  await registerOutcome(page, s.name, 'Necesita cita');
  const schedule = page.getByRole('dialog', { name: 'Agendar revisión' });
  await expect(schedule).toBeVisible();
  const form = schedule.getByRole('form', { name: 'Agendar cita' });
  await expect(form).toContainText(s.name, { timeout: 15_000 });
  await expect(form.getByLabel('Motivo (opcional)', { exact: true })).toHaveValue('Revisión postoperatoria');
  await expect(form.getByLabel('Profesional', { exact: true })).toHaveValue(dentistId);
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(list).not.toContainText(s.name, { timeout: 15_000 });
});

import { test, expect, type Page } from './support/test';
import { fillDate, fillTime } from './support/dates';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { E2E_REGION } from './support/regional';

/**
 * e2e DX-233: horario de cada profesional por sede, con excepciones por fecha.
 *
 * Una clínica nueva por corrida con dos sedes (A = la principal, B = nueva),
 * ambas abiertas de lunes a sábado de 07:00 a 20:00, y una odontóloga,
 * «Ximena Rotación», que el ADMIN configura desde la UI: lunes y miércoles
 * 08:00–13:00 en A y jueves 14:00–19:00 en B, con una excepción «no trabaja»
 * el jueves de la semana siguiente en B. Luego: el cuadrante lo muestra así,
 * la agenda Día sombrea y oculta según la sede, y «Buscar hueco» solo propone
 * el jueves de 14:00 a 19:00 en B.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `horario-pro-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.horario.${suffix}@example.com` };
const dentist = { fullName: 'Ximena Rotación', email: `ximena.${suffix}@example.com` };
const sedeB = `Sede Norte ${suffix.slice(0, 6)}`;
const patientLast = `Rotación${suffix}`.slice(0, 40);

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
const THURSDAY = plusDays(MONDAY, 3);
const NEXT_THURSDAY = plusDays(MONDAY, 10);

let session: ApiSession;
let sedeAId = '';
let sedeAName = '';
let sedeBId = '';
let dentistId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Rotación ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string; name: string }[])[0];
  sedeAId = principal.id;
  sedeAName = principal.name;
  sedeBId = (await apiPost<{ id: string }>(request, session, '/locations', { name: sedeB, ...E2E_REGION })).id;
  const openWeek = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 7 * 60, endMinute: 20 * 60 }));
  for (const id of [sedeAId, sedeBId]) {
    const res = await request.put(`${API_URL}/locations/schedule`, {
      headers: { ...session.headers, 'X-Location-Id': id },
      data: { ranges: openWeek },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  dentistId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === dentist.fullName,
  )!.userId;
});

async function useSede(page: Page, id: string | null) {
  await page.evaluate((value) => {
    if (value) window.localStorage.setItem('dentalix.activeLocationId', value);
    else window.localStorage.removeItem('dentalix.activeLocationId');
  }, id);
}

async function setRange(page: Page, day: string, sede: string, from: string, to: string) {
  const group = page.getByRole('group', { name: day, exact: true });
  await group.getByRole('button', { name: `Agregar tramo en ${sede}` }).click();
  // Los tramos son `TimeField` (B6): se escriben por segmentos.
  await fillTime(group, `Desde, ${day}, ${sede}, tramo 1`, from);
  await fillTime(group, `Hasta, ${day}, ${sede}, tramo 1`, to);
}

test('ADMIN define la rotación en dos sedes, copia el lunes al miércoles, añade una excepción y el cuadrante lo muestra', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/horarios?tab=profesionales`);

  await expect(page.getByRole('tab', { name: 'Profesionales' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await expect(
    page.getByText('Este profesional aún no tiene horario: se le puede citar en cualquier horario de la sede.'),
  ).toBeVisible({ timeout: 10_000 });

  await setRange(page, 'Lunes', sedeAName, '08:00', '13:00');
  await page.getByRole('group', { name: 'Lunes', exact: true }).getByRole('button', { name: 'Copiar el lunes a otros días' }).click();
  const copyDialog = page.getByRole('dialog', { name: 'Copiar el lunes' });
  await copyDialog.getByRole('checkbox', { name: 'Miércoles' }).check();
  await copyDialog.getByRole('button', { name: 'Copiar' }).click();
  await expect(copyDialog).toBeHidden();
  await expect(page.getByRole('group', { name: `Desde, Miércoles, ${sedeAName}, tramo 1` })).toHaveText(/08\D*00/);

  // Un tramo del jueves en las dos sedes a la vez: no se guarda.
  await setRange(page, 'Jueves', sedeB, '14:00', '19:00');
  await setRange(page, 'Jueves', sedeAName, '15:00', '16:00');
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(page.getByRole('form', { name: 'Horario semanal' }).getByRole('alert')).toContainText(
    `Jueves: el tramo de ${sedeAName} se solapa con el de ${sedeB}`,
  );
  await page
    .getByRole('group', { name: 'Jueves', exact: true })
    .getByRole('button', { name: `Quitar tramo, Jueves, ${sedeAName}, tramo 1` })
    .click();
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(page.getByText('Horario guardado.', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/aún no tiene horario/)).toBeHidden();

  // Excepción: el jueves de la semana siguiente no trabaja en la sede B.
  await page.getByRole('button', { name: 'Añadir excepción' }).click();
  const overrideDialog = page.getByRole('dialog', { name: 'Nueva excepción' });
  await overrideDialog.getByLabel('Sede', { exact: true }).selectOption({ label: sedeB });
  await fillDate(overrideDialog, 'Fecha', NEXT_THURSDAY);
  await overrideDialog.getByLabel('Nota (opcional)').fill('Congreso');
  await overrideDialog.getByRole('button', { name: 'Guardar excepción' }).click();
  await expect(overrideDialog).toBeHidden({ timeout: 10_000 });
  const overrides = page.getByRole('list', { name: 'Excepciones por fecha' });
  await expect(overrides).toContainText(`${sedeB} · No trabaja`);
  await expect(overrides).toContainText('Congreso');

  // --- Cuadrante de la semana del lunes elegido ---
  await page.getByRole('tab', { name: 'Cuadrante' }).click();
  await expect(page).toHaveURL(/tab=cuadrante/);
  // El cuadrante abre en la semana de hoy: se avanza hasta la del lunes elegido.
  const today = sedeDayFromToday(0);
  const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const thisMonday = plusDays(today, todayWeekday === 0 ? -6 : 1 - todayWeekday);
  const weeks = Math.round(
    (new Date(`${MONDAY}T12:00:00Z`).getTime() - new Date(`${thisMonday}T12:00:00Z`).getTime()) / (7 * 86_400_000),
  );
  await expect(page.getByRole('region', { name: dentist.fullName })).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < weeks; i++) await page.getByRole('button', { name: 'Semana siguiente' }).click();
  const row = page.getByRole('region', { name: dentist.fullName });
  const day = (date: string, weekday: string) =>
    row.getByRole('group', { name: new RegExp(`^${weekday}, ${Number(date.slice(8, 10))} de`) });
  await expect(day(MONDAY, 'lunes')).toContainText(sedeAName);
  await expect(day(MONDAY, 'lunes')).toContainText('08:00–13:00');
  await expect(day(plusDays(MONDAY, 2), 'miércoles')).toContainText('08:00–13:00');
  await expect(day(THURSDAY, 'jueves')).toContainText(sedeB);
  await expect(day(THURSDAY, 'jueves')).toContainText('14:00–19:00');
  await expect(day(plusDays(MONDAY, 1), 'martes')).toContainText('Libre');
  await expectNoHorizontalScroll(page);

  // La semana siguiente, el jueves dice la excepción.
  await page.getByRole('button', { name: 'Semana siguiente' }).click();
  await expect(day(NEXT_THURSDAY, 'jueves')).toContainText('No trabaja');
  await expect(day(NEXT_THURSDAY, 'jueves')).toContainText('Excepción');
});

test('agenda Día: en la sede B el lunes no sale (con «Mostrar todos»); en la A se sombrea fuera de 08:00–13:00', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await useSede(page, sedeBId);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', MONDAY);

  const ximena = page.locator(`[data-testid="day-column"][data-provider-id="${dentistId}"]`);
  await expect(page.getByText('1 profesional no atiende este día en esta sede.')).toBeVisible({ timeout: 15_000 });
  await expect(ximena).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mostrar todos' }).check();
  await expect(ximena).toHaveCount(1);
  // No atiende allí: toda su columna sombreada.
  await expect(ximena.getByTestId('provider-off-band')).toHaveCount(1);

  await useSede(page, sedeAId);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', MONDAY);
  await expect(ximena).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText(/no atiende este día en esta sede/)).toBeHidden();
  await expect(page.locator('[data-testid="day-column-header"]').filter({ hasText: dentist.fullName })).toContainText(
    '08:00–13:00',
  );
  // Antes de las 08:00 y después de las 13:00.
  await expect(ximena.getByTestId('provider-off-band')).toHaveCount(2);
  await expect(page.getByText('Fuera del horario del profesional en esta sede')).toBeVisible();
});

test('una cita fuera de su horario se agenda con el aviso; «Buscar hueco» en la sede B solo propone el jueves de 14:00 a 19:00', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: patientLast,
    docType: 'NATIONAL_ID',
    docNumber: `ROT${suffix}`.slice(0, 20),
    sex: 'M',
  });

  // Cita del jueves en la sede B (dentro de su horario) que luego se cancela:
  // el paciente queda en «Pendientes» de la sede B.
  const sedeBHeaders = { ...session.headers, 'X-Location-Id': sedeBId };
  const created = await request.post(`${API_URL}/appointments`, {
    headers: sedeBHeaders,
    data: {
      patientId: patient.id,
      providerId: dentistId,
      start: atSede(THURSDAY, '15:00').toISOString(),
      end: atSede(THURSDAY, '15:30').toISOString(),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const appointment = (await created.json()) as { id: string; warnings: string[]; warningCodes?: string[] };
  expect(appointment.warnings).toEqual([]);
  const cancel = await request.patch(`${API_URL}/appointments/${appointment.id}`, {
    headers: sedeBHeaders,
    data: { status: 'CANCELLED', cancelledByKind: 'CLINIC', cancelReasonCode: 'CLINIC_RESCHEDULE' },
  });
  expect(cancel.ok(), await cancel.text()).toBeTruthy();

  await loginAs(page, origin, admin.email, password);
  await useSede(page, sedeAId);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', plusDays(MONDAY, 1));

  // Martes en la sede A: no trabaja. Se cita igual (Mostrar todos) y avisa.
  await page.getByRole('checkbox', { name: 'Mostrar todos' }).check({ timeout: 15_000 });
  const ximena = page.locator(`[data-testid="day-column"][data-provider-id="${dentistId}"]`);
  await ximena.getByRole('button', { name: `Nueva cita con ${dentist.fullName}` }).click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await form.getByLabel('Paciente', { exact: true }).fill(`ROT${suffix}`.slice(0, 20));
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await fillTime(form, 'Hora de inicio', '10:00');
  await fillTime(form, 'Hora de fin', '10:30');
  await expect(form.getByTestId('provider-off-schedule')).toContainText(
    `${dentist.fullName} no atiende en esta sede ese día. Se puede agendar igual; quedará el aviso.`,
  );
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('Cita fuera del horario del profesional')).toBeVisible({ timeout: 10_000 });
  await expect(ximena.getByTestId('day-column-appointment')).toHaveCount(1);

  // --- «Buscar hueco» desde «Pendientes» de la sede B ---
  await useSede(page, sedeBId);
  await page.goto(`${origin}/agenda`);
  const panel = page.getByRole('complementary', { name: 'Pendientes por agendar' });
  const entry = panel.getByTestId('waitlist-entry').filter({ hasText: `Bruno ${patientLast}` });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await entry.getByRole('button', { name: `Buscar hueco para Bruno ${patientLast}` }).click();
  const search = page.getByRole('dialog', { name: `Buscar hueco para Bruno ${patientLast}` });
  await search.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await fillDate(search, 'Hasta', NEXT_THURSDAY);
  await fillDate(search, 'Desde', MONDAY);
  await search.getByRole('button', { name: 'Buscar' }).click();
  const openings = search.getByTestId('opening');
  // Solo el jueves de esta semana (el de la siguiente tiene la excepción).
  await expect(openings).toHaveCount(1, { timeout: 10_000 });
  await expect(openings.first()).toContainText('14:00–19:00');
  await expect(search).toContainText(new RegExp(`jueves, ${Number(THURSDAY.slice(8, 10))} de`, 'i'));
});

test('390 px: el editor va en acordeón por días y ni el editor ni el cuadrante desbordan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/horarios?tab=profesionales`);
  await page.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });

  const jueves = page.getByRole('group', { name: 'Jueves', exact: true });
  const toggle = jueves.getByRole('button', { name: /^Jueves/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 10_000 });
  await expect(toggle).toContainText(`${sedeB} 14:00–19:00`);
  await expect(jueves.getByLabel(`Desde, Jueves, ${sedeB}, tramo 1`)).toBeHidden();
  await toggle.click();
  await expect(jueves.getByLabel(`Desde, Jueves, ${sedeB}, tramo 1`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('tab', { name: 'Cuadrante' }).click();
  await expect(page.getByRole('region', { name: dentist.fullName })).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
});

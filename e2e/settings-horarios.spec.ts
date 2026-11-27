import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { addDays, sedeDayFromToday } from './support/clock';
import { fillDate, fillTime } from './support/dates';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-069: el horario de la SEDE en Ajustes → Horarios (pestaña «Sede»).
 *
 * Una clínica nueva por corrida; su sede nace con el horario por defecto
 * (lun–vie 9–13 y 15–19, sáb 9–13). El ADMIN deja el lunes en un solo tramo,
 * 09:00–12:00, guarda, recarga y lo ve guardado (y la API también). Luego
 * «Nueva cita» ese lunes a las 12:30 avisa en español con el horario del día y
 * no crea la cita. Nada de «ahora + N»: un lunes a una semana o más de hoy en
 * la sede, a horas fijas.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `horario-sede-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.horario.sede.${suffix}@example.com` };
const patientDoc = `HOR${suffix}`.slice(0, 20);

/** El primer lunes a 7 días o más de hoy en la sede. */
const MONDAY = (() => {
  let day = sedeDayFromToday(7);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() !== 1) day = addDays(day, 1);
  return day;
})();

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Horario ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await apiPost(request, session, '/patients', {
    firstName: 'Carmen',
    lastName: `Horario${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: patientDoc,
    sex: 'F',
  });
});

test('ADMIN cambia el horario de la sede, recarga y lo ve guardado', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/horarios`);

  await expect(page.getByRole('tab', { name: 'Sede' })).toHaveAttribute('aria-selected', 'true');
  const week = page.getByRole('list', { name: 'Horario de la semana' });
  // El horario por defecto: el lunes abre de 09:00 a 13:00 y de 15:00 a 19:00.
  await expect(week.getByRole('group', { name: 'Lunes, tramo 2: desde', exact: true })).toHaveText(/15\D*00/, {
    timeout: 15_000,
  });

  await fillTime(week, 'Lunes, tramo 1: hasta', '12:00');
  await week.getByRole('button', { name: 'Quitar tramo Lunes 2', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar horario', exact: true }).click();
  await expect(page.getByText('Horario guardado.')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(week.getByRole('group', { name: 'Lunes, tramo 1: hasta', exact: true })).toHaveText(/12\D*00/, {
    timeout: 15_000,
  });
  await expect(week.getByRole('group', { name: 'Lunes, tramo 1: desde', exact: true })).toHaveText(/09\D*00/);
  await expect(week.getByRole('group', { name: 'Lunes, tramo 2: desde', exact: true })).toHaveCount(0);
  // El resto de la semana no cambió: el martes sigue con sus dos tramos.
  await expect(week.getByRole('group', { name: 'Martes, tramo 2: hasta', exact: true })).toHaveText(/19\D*00/);

  const res = await request.get(`${API_URL}/locations/schedule`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const saved = (await res.json()) as { ranges: { weekday: number; startMinute: number; endMinute: number }[] };
  expect(saved.ranges.filter((r) => r.weekday === 1)).toEqual([{ weekday: 1, startMinute: 540, endMinute: 720 }]);
});

test('agendar fuera del horario guardado avisa en español con el horario del día y no crea la cita', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('main').getByRole('button', { name: 'Nueva cita' }).first().click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await expect(form).toBeVisible();
  await form.getByLabel('Paciente', { exact: true }).fill(patientDoc);
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await form.getByLabel('Profesional', { exact: true }).selectOption({ label: admin.fullName });
  await fillDate(form, 'Fecha', MONDAY);
  await fillTime(form, 'Hora de inicio', '12:30');
  await fillTime(form, 'Hora de fin', '13:00');
  // La pista del día ya dice el horario nuevo.
  await expect(form.getByText(/^Horario de ese día: 09:00\s?–\s?12:00$/)).toBeVisible({ timeout: 15_000 });

  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(
    form.getByText(/^Fuera del horario de atención\. Ese día se atiende: 09:00\s?–\s?12:00\.$/),
  ).toBeVisible();
  await expect(form).toBeVisible();

  const list = await request.get(
    `${API_URL}/appointments?from=${MONDAY}T00:00:00.000Z&to=${addDays(MONDAY, 1)}T23:59:59.000Z`,
    { headers: session.headers },
  );
  expect(list.ok()).toBeTruthy();
  const body = (await list.json()) as unknown[] | { items: unknown[] };
  expect(Array.isArray(body) ? body.length : body.items.length).toBe(0);
});

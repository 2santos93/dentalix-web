import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-492 (porción 2 de sillones): «Atender sin cita» elige un sillón libre
 * de la sede y, si choca, sale el 409 con su nombre; «En clínica» lo muestra y
 * «Mover a…» lo cambia; Semana y Mes lo llevan en el chip; las columnas vacías
 * de otro día dicen «Sin citas este día». En serie: cada test sigue donde lo
 * dejó el anterior. Sede sin restricción de horario y sin huecos reservados:
 * la urgencia va en sobrecupo.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sillones2-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sillón', email: `luis.${suffix}@example.com` };
const lastName = `Sillones${suffix}`.slice(0, 20);
const day = sedeDayFromToday(2);

let session: ApiSession;
let locationId = '';
let dentistId = '';
let patientId = '';
let chairOne = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sillones ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  dentistId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (s) => s.fullName === dentist.fullName,
  )!.userId;
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  locationId = ((await locations.json()) as { id: string }[])[0].id;
  await apiPost(request, session, '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
  const one = await apiPost<{ id: string }>(request, session, '/chairs', { locationId, name: 'Sillón 1' });
  chairOne = one.id;
  await apiPost(request, session, '/chairs', { locationId, name: 'Sillón 2' });
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Carla',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `CAR${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
});

async function loginInSede(page: Page) {
  await loginAs(page, origin, admin.email, password);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), locationId);
}

test('«Atender sin cita» con sillón libre: «En clínica» lo muestra y «Mover a…» lo cambia', async ({ page }) => {
  await loginInSede(page);
  await page.goto(`${origin}/agenda/en-clinica`);
  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await dialog.getByLabel('Buscar paciente').fill(`Carla ${lastName}`.slice(0, 20));
  await dialog.getByRole('button', { name: new RegExp(`Carla ${lastName}`) }).click();
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByLabel('Sillón (opcional)').selectOption({ label: 'Sillón 1' });
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await dialog.getByLabel('Motivo del sobrecupo').fill('Dolor agudo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = page.getByTestId('in-clinic-item').filter({ hasText: `Carla ${lastName}` });
  await expect(row.getByTestId('in-clinic-chair')).toHaveText('Sillón 1', { timeout: 15_000 });

  await row.getByRole('button', { name: /^Mover a…/ }).click();
  const move = page.getByRole('dialog', { name: 'Mover a…' });
  await expect(move.getByText(/el profesional y el sillón para la cita/)).toBeVisible({ timeout: 10_000 });
  await move.getByLabel('Sillón').selectOption({ label: 'Sillón 2' });
  await move.getByRole('button', { name: 'Mover cita' }).click();
  await expect(move).toBeHidden({ timeout: 10_000 });
  await expect(row.getByTestId('in-clinic-chair')).toHaveText('Sillón 2', { timeout: 15_000 });
});

test('«Atender sin cita»: el sillón ocupado no se ofrece y, si alguien lo ocupa entretanto, 409 con su nombre', async ({
  page,
  request,
}) => {
  await loginInSede(page);
  await page.goto(`${origin}/agenda/en-clinica`);
  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await dialog.getByRole('radio', { name: 'Paciente nuevo' }).click();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Diego');
  await dialog.getByLabel('Apellido', { exact: true }).fill(lastName);
  await dialog.getByLabel('Teléfono').fill('+58 412 555 0101');
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  const chair = dialog.getByLabel('Sillón (opcional)');
  await expect(chair.locator('option')).toHaveText(['Sin sillón', 'Sillón 1']);
  await chair.selectOption({ label: 'Sillón 1' });

  // Otra recepción se adelanta con el mismo sillón, ya desde la API.
  const other = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Elsa',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `ELS${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await apiPost(request, session, '/appointments/walk-in', {
    patientId: other.id,
    providerId: dentistId,
    chairId: chairOne,
    overbookReason: 'Llegó primero',
  });

  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await dialog.getByLabel('Motivo del sobrecupo').fill('Dolor agudo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).click();
  await expect(dialog.getByText(/El sillón «Sillón 1» ya está ocupado/)).toBeVisible({ timeout: 10_000 });
  await expect(chair.locator('option')).toHaveText(['Sin sillón'], { timeout: 10_000 });
  await expect(dialog.getByText('Todos los sillones de la sede están ocupados ahora.')).toBeVisible();
});

test('Semana y Mes llevan el sillón en el chip; 390 px sin scroll horizontal', async ({ page, request }) => {
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId: dentistId,
    chairId: chairOne,
    start: atSede(day, '09:00'),
    end: atSede(day, '09:30'),
  });
  await loginInSede(page);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  // La de `day`, no la primera: las urgencias de hoy pueden caer en esta semana, a media
  // columna, y ahí un nombre largo deja la etiqueta del sillón sin ancho (se recorta ella antes).
  const chip = page.locator(`[data-testid="week-grid-appointment"][data-id="${appointment.id}"]`);
  await expect(chip.getByTestId('week-appointment-chair')).toHaveText('Sillón 1', { timeout: 15_000 });
  await expect(chip.getByTestId('week-appointment-chair')).toBeVisible();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.getByTestId('month-appointment-chair').filter({ hasText: 'Sillón 1' }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.setViewportSize({ width: 390, height: 800 });
  await expectNoHorizontalScroll(page);
  await page.goto(`${origin}/agenda/en-clinica`);
  await expect(page.getByTestId('in-clinic-chair').first()).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
});

test('las columnas vacías de otro día dicen «Sin citas este día»', async ({ page }) => {
  await loginInSede(page);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await fillDate(page, 'Fecha', sedeDayFromToday(3));
  await expect(page.getByText('Sin citas este día').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Sin citas hoy')).toHaveCount(0);
});

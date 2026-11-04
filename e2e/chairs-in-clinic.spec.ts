import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { fillDate, fillTime } from './support/dates';
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

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const candidate = sedeDayFromToday(n);
    const weekday = new Date(`${candidate}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return candidate;
  }
}

let session: ApiSession;
let locationId = '';
let dentistId = '';
let patientId = '';
let chairOne = '';
let chairTwo = '';

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
  chairTwo = (await apiPost<{ id: string }>(request, session, '/chairs', { locationId, name: 'Sillón 2' })).id;
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
  // DX-492-bis: a la misma hora, con la titular, en «Sillón 2» y con un nombre largo: las dos
  // van a media columna, donde antes el sillón se quedaba sin ancho.
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const adminId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (s) => s.fullName === admin.fullName,
  )!.userId;
  const longName = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'María Fernanda',
    lastName: `Rodríguez Villalobos ${lastName}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `MFR${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const shared = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: longName.id,
    providerId: adminId,
    chairId: chairTwo,
    start: atSede(day, '09:00'),
    end: atSede(day, '09:30'),
  });
  // Y dos de 15 min, también a media columna: la fila compacta (paciente, sillón y estado en una línea).
  const short = [
    await apiPost<{ id: string }>(request, session, '/appointments', {
      patientId,
      providerId: dentistId,
      chairId: chairOne,
      start: atSede(day, '10:00'),
      end: atSede(day, '10:15'),
    }),
    await apiPost<{ id: string }>(request, session, '/appointments', {
      patientId: longName.id,
      providerId: adminId,
      chairId: chairTwo,
      start: atSede(day, '10:00'),
      end: atSede(day, '10:15'),
    }),
  ];
  await loginInSede(page);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  // Por `data-id`, no la primera: las urgencias de hoy pueden caer en esta semana.
  for (const [id, name] of [
    [appointment.id, 'Sillón 1'],
    [shared.id, 'Sillón 2'],
    [short[0].id, 'Sillón 1'],
    [short[1].id, 'Sillón 2'],
  ] as const) {
    const label = page.locator(`[data-testid="week-grid-appointment"][data-id="${id}"]`).getByTestId('week-appointment-chair');
    await expect(label).toHaveText(name, { timeout: 15_000 });
    await expect(label).toBeVisible();
    const fit = await label.evaluate((el) => {
      // El ancho del texto tal cual (la elipsis solo se pinta): si la caja es menor, aunque sea
      // por una fracción de píxel, sale «Silló…».
      const range = document.createRange();
      range.selectNodeContents(el);
      const patient = el.previousElementSibling as HTMLElement;
      return {
        chairWhole: range.getBoundingClientRect().width <= el.getBoundingClientRect().width + 0.01,
        patientWidth: patient.clientWidth,
        rowOverflow: el.parentElement!.scrollWidth - el.parentElement!.clientWidth,
      };
    });
    // El sillón entero; el paciente cede, pero se sigue viendo; la fila no desborda.
    expect(fit.chairWhole).toBe(true);
    expect(fit.patientWidth).toBeGreaterThan(0);
    expect(fit.rowOverflow).toBeLessThanOrEqual(0);
  }
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

test('DX-492-bis: un sobrecupo con sillón movido a una hora con el sillón ocupado ofrece el siguiente hueco con ese sillón', async ({
  page,
  request,
}) => {
  const chair = await apiPost<{ id: string }>(request, session, '/chairs', { locationId, name: 'Sillón Caracas' });
  const dora = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Dora',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `49201${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const walkIn = await apiPost<{ id: string; start: string }>(request, session, '/appointments/walk-in', {
    patientId: dora.id,
    providerId: dentistId,
    chairId: chair.id,
    overbookReason: 'Dolor agudo, no puede esperar',
  });
  // Sobrecupo mantenido a sabiendas: otra cita del odontólogo, con otra paciente, ocupa su hora
  // (o ya la ocupaba: 409).
  const ines = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Inés',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `49202${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const over = new Date(Math.max(Date.now(), new Date(walkIn.start).getTime()) + 5 * 60_000);
  const blocker = await request.post(`${API_URL}/appointments`, {
    headers: session.headers,
    data: {
      patientId: ines.id,
      providerId: dentistId,
      start: over.toISOString(),
      end: new Date(over.getTime() + 30 * 60_000).toISOString(),
    },
  });
  expect([201, 409], await blocker.text()).toContain(blocker.status());
  await apiPost(request, session, `/appointments/${walkIn.id}/undo-arrival`, { keepOverbooked: true });
  const kept = await request.get(`${API_URL}/appointments/${walkIn.id}`, { headers: session.headers });
  expect(await kept.json()).toMatchObject({ overbooked: true, chairId: chair.id });
  // Destino: el primer día laborable a cuatro días o más, a las 10:00 (un domingo «Buscar
  // hueco» salta al lunes); el odontólogo está libre, pero la titular ocupa «Sillón Caracas»
  // de 10:00 a 10:30.
  const target = weekdayFrom(4);
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const adminId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (s) => s.fullName === admin.fullName,
  )!.userId;
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId: adminId,
    chairId: chair.id,
    start: atSede(target, '10:00'),
    end: atSede(target, '10:30'),
  });

  await loginInSede(page);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await page.getByRole('button', { name: `Mover a… la cita de Dora ${lastName}` }).click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Mover a…' });
  await fillDate(dialog, 'Fecha', target);
  await fillTime(dialog, 'Hora de inicio', '10:00');
  await dialog.getByRole('button', { name: 'Mover cita' }).click();
  await expect(dialog.getByText('El sillón «Sillón Caracas» ya está ocupado de 10:00 a 10:30')).toBeVisible({
    timeout: 10_000,
  });
  const offer = dialog.getByTestId('move-next-opening');
  await expect(offer).toContainText('Siguiente hueco libre', { timeout: 10_000 });
  await expect(offer).toContainText(`10:30 con ${dentist.fullName}, en «Sillón Caracas».`);
  await offer.getByRole('button', { name: 'Usar este hueco' }).click();
  await dialog.getByRole('button', { name: 'Mover cita' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  const moved = await request.get(`${API_URL}/appointments/${walkIn.id}`, { headers: session.headers });
  expect(await moved.json()).toMatchObject({
    start: atSede(target, '10:30').toISOString(),
    chairId: chair.id,
    overbooked: false,
  });
});

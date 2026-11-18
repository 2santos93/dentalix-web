import { randomUUID } from 'node:crypto';
import { test, expect, watchCspViolations, type Page } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeViolations } from './support/axe';
import { fillDate } from './support/dates';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';
import { sedeDate } from './support/clock';

/**
 * e2e DX-016 — reserva online de punta a punta y sin mocks de la API: el ADMIN
 * activa la reserva y marca un tipo visible en Ajustes › Reserva online; un
 * paciente NUEVO, en un móvil sin sesión, reserva en `/reservar` del host de la
 * clínica (modo directo) y la cita aparece en la agenda con la marca «Online».
 * Después, en modo solicitud, otra paciente pide una hora y recepción la acepta
 * en la bandeja «Solicitudes online».
 *
 * La API exige ≥ 4 s entre cargar el formulario (`formToken`) y enviarlo: la
 * página espera sola lo que falte; aquí no se salta nada.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const password = 'Password123!';
const TYPE_NAME = 'Limpieza dental';

const POLICY = {
  policyText: 'La clínica trata tus datos personales para gestionar tus citas y tu atención odontológica.',
  generalText: 'Autorizo el tratamiento de mis datos personales para gestionar mis citas.',
  sensitiveHealthText: 'Autorizo el tratamiento de mis datos de salud para mi atención odontológica.',
  marketingText: 'Autorizo recibir comunicaciones comerciales.',
};

interface ListedAppointment {
  id: string;
  start: string;
  origin?: string;
  patientFirstName: string | null;
}

async function setupClinic(request: Parameters<typeof registerClinicViaApi>[0], tag: string) {
  const subdomain = `test-reserva-${tag}-${suffix}`.slice(0, 40);
  const email = `reserva.${tag}.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ávila ${tag} ${suffix}`,
    fullName: 'Dra. Andreína Salazar',
    email,
    password,
  });
  await apiPost(request, session, '/privacy-policies', POLICY);
  const type = await apiPost<{ id: string }>(request, session, '/appointment-types', {
    name: TYPE_NAME,
    durationMinutes: 30,
    color: '#0E7490',
  });
  return { session, email, typeId: type.id };
}

async function onlineAppointments(page: Page, session: ApiSession): Promise<ListedAppointment[]> {
  const from = new Date(Date.now() - 86_400_000).toISOString();
  const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const res = await page.request.get(`${API_URL}/appointments?from=${from}&to=${to}`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as ListedAppointment[] | { items: ListedAppointment[] };
  const items = Array.isArray(body) ? body : body.items;
  return items.filter((a) => a.origin === 'ONLINE');
}

/** Paso 1 (tratamiento, primera visita) en /reservar y la primera hora libre. Devuelve su texto. */
async function pickFirstSlot(patient: Page, kind: 'NEW' | 'EXISTING'): Promise<string> {
  await patient.getByRole('radio', { name: new RegExp(TYPE_NAME) }).check();
  await patient
    .getByRole('radio', { name: kind === 'NEW' ? /Sí, es mi primera vez/ : /No, ya soy paciente/ })
    .check();
  await patient.getByRole('button', { name: 'Continuar' }).click();
  await expect(patient.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();
  const first = patient.getByTestId('booking-times').getByRole('button').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  const label = (await first.textContent())?.trim() ?? '';
  await first.click();
  await expect(patient.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  return label;
}

async function fillNewPatient(patient: Page, firstName: string, lastName: string, mail: string) {
  await patient.getByLabel('Nombre', { exact: true }).fill(firstName);
  await patient.getByLabel('Apellido', { exact: true }).fill(lastName);
  await fillDate(patient, 'Fecha de nacimiento', '1991-03-08');
  await patient.getByLabel('Email', { exact: true }).fill(mail);
  await patient.getByLabel('Teléfono', { exact: true }).fill('0412 555 2468');
  await patient.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos personales/ }).check();
}

test('ADMIN activa la reserva online → paciente NUEVO reserva en /reservar (directa) → la agenda la marca «Online»', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { session, email } = await setupClinic(request, 'dir');
  const origin = session.origin;

  // --- ADMIN: Ajustes › Reserva online ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, email, password);
  await page.goto(`${origin}/settings/reserva-online`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reserva online' })).toBeVisible();
  await expect(page.getByTestId('online-booking-url')).toHaveText(`${origin}/reservar`);
  await page.getByRole('checkbox', { name: /Reserva online activada/ }).check();
  await page
    .getByRole('radiogroup', { name: 'Pacientes nuevos' })
    .getByRole('radio', { name: /Reserva directa/ })
    .check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ajustes de la reserva online guardados.')).toBeVisible();
  await expect(page.getByTestId('online-booking-status')).toHaveText('Activa');
  const visible = page.getByRole('switch', { name: `Ofrecer «${TYPE_NAME}» online` });
  await visible.check();
  await expect(visible).toBeChecked();
  await expect(page.getByText(`«${TYPE_NAME}» guardado.`)).toBeVisible();
  expect(await axeViolations(page, page.locator('main'))).toEqual([]);
  await shot(page, 'dx016-settings', 1440);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { level: 1, name: 'Reserva online' }).scrollIntoViewIfNeeded();
  await shot(page, 'dx016-settings', 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('heading', { level: 1, name: 'Reserva online' }).scrollIntoViewIfNeeded();
  await shot(page, 'dx016-settings-top', 1440);

  // --- Paciente: móvil, sin sesión, en el host de la clínica ---
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const csp = watchCspViolations(ctx);
  const patient = await ctx.newPage();
  const response = await patient.goto(`${origin}/reservar`);
  expect(response?.headers()['cache-control']).toBe('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(patient.getByRole('heading', { name: '¿Qué necesitas?' })).toBeVisible({ timeout: 15_000 });
  await expect(patient.getByRole('heading', { level: 1, name: `Clínica Ávila dir ${suffix}` })).toBeVisible();
  await patient.getByRole('radio', { name: new RegExp(TYPE_NAME) }).check();
  await patient.getByRole('radio', { name: /Sí, es mi primera vez/ }).check();
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-servicio', 390);
  await patient.setViewportSize({ width: 1440, height: 900 });
  await shot(patient, 'dx016-reservar-servicio', 1440);
  await patient.setViewportSize({ width: 390, height: 844 });
  await patient.getByRole('button', { name: 'Continuar' }).click();

  await expect(patient.getByRole('heading', { name: 'Elige día y hora' })).toBeFocused();
  const firstTime = patient.getByTestId('booking-times').getByRole('button').first();
  await expect(firstTime).toBeVisible({ timeout: 15_000 });
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-horas', 390);
  await patient.setViewportSize({ width: 1440, height: 900 });
  await shot(patient, 'dx016-reservar-horas', 1440);
  await patient.setViewportSize({ width: 390, height: 844 });
  const timeText = ((await firstTime.textContent()) ?? '').trim();
  await firstTime.click();

  await expect(patient.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  await expect(patient.getByTestId('booking-summary')).toContainText(timeText);

  // Otra paciente, en otro móvil, elige la MISMA hora antes de que la primera reserve.
  const rivalCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rival = await rivalCtx.newPage();
  await rival.goto(`${origin}/reservar`);
  await expect(rival.getByRole('heading', { name: '¿Qué necesitas?' })).toBeVisible({ timeout: 15_000 });
  expect(await pickFirstSlot(rival, 'NEW')).toBe(timeText);
  await fillNewPatient(rival, 'Daniela', `Paredes${suffix}`, `daniela.${suffix}@example.com`);

  await fillNewPatient(patient, 'Valentina', `Guerrero${suffix}`, `valentina.${suffix}@example.com`);
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-datos-nuevo', 390);
  await patient.getByRole('button', { name: 'Reservar la cita' }).click();

  await expect(patient.getByRole('heading', { name: 'Tu cita está reservada' })).toBeVisible({ timeout: 20_000 });
  await expect(patient.getByTestId('booking-summary')).toContainText(timeText);
  await expect(patient.getByRole('link', { name: 'Ver mi cita' })).toHaveAttribute('href', /\/confirmar\//);
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-booked', 390);
  // Sin scroll horizontal a 390 px.
  expect(
    await patient.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  csp.expectNone();
  await ctx.close();

  // La segunda llega tarde: 409, vuelta a las horas (recargadas, sin esa) con el aviso y sus datos guardados.
  await rival.getByRole('button', { name: 'Reservar la cita' }).click();
  await expect(rival.getByTestId('booking-slot-notice')).toContainText(/ya no está disponible|se acaba de ocupar/, {
    timeout: 20_000,
  });
  await expect(rival.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();
  const rivalFirst = rival.getByTestId('booking-times').getByRole('button').first();
  await expect(rivalFirst).toBeVisible({ timeout: 15_000 });
  expect(((await rivalFirst.textContent()) ?? '').trim()).not.toBe(timeText);
  expect(await axeViolations(rival, rival.locator('main'))).toEqual([]);
  await shot(rival, 'dx016-reservar-hueco-ocupado', 390);
  await rivalCtx.close();

  // --- La agenda: la cita, con la marca «Online» ---
  const [booked] = await onlineAppointments(page, session);
  expect(booked, 'la cita reservada online').toBeTruthy();
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', sedeDate(new Date(booked.start)));
  const chip = page.getByTestId('online-chip').first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: new RegExp(`Online · .*Valentina Guerrero${suffix}`) })).toBeVisible();
  await shot(page, 'dx016-agenda-online', 1440);
});

test('modo solicitud: paciente NUEVO pide una hora → «Recibimos tu solicitud» → recepción la acepta en «Solicitudes online»', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { session, email, typeId } = await setupClinic(request, 'sol');
  const origin = session.origin;
  // Por la API (la UI de ajustes ya la prueba el test anterior).
  const put = async (path: string, data: object) => {
    const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
    expect(res.ok(), await res.text()).toBeTruthy();
  };
  await put('/online-booking/settings', {
    enabled: true,
    newPatientMode: 'REQUEST',
    existingPatientMode: 'REQUEST',
    minLeadMinutesNew: 120,
    minLeadMinutesExisting: 120,
    maxAdvanceDays: 60,
    slotStepMinutes: 15,
  });
  await put(`/online-booking/types/${typeId}`, {
    visibleOnline: true,
    durationNewMinutes: null,
    durationExistingMinutes: null,
    providerIds: [],
    locationIds: [],
  });

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const patient = await ctx.newPage();
  await patient.goto(`${origin}/reservar`);
  await expect(patient.getByRole('heading', { name: '¿Qué necesitas?' })).toBeVisible({ timeout: 15_000 });
  await pickFirstSlot(patient, 'NEW');
  await fillNewPatient(patient, 'Gabriel', `Rondón${suffix}`, `gabriel.${suffix}@example.com`);
  await patient.getByRole('button', { name: 'Enviar la solicitud' }).click();
  await expect(patient.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeVisible({ timeout: 20_000 });
  await expect(patient.getByRole('link', { name: 'Ver mi cita' })).toHaveCount(0);
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-requested', 390);

  // Paciente con ficha: el paso del código (respuesta neutra, sin decir si existe).
  await patient.goto(`${origin}/reservar`);
  await expect(patient.getByRole('heading', { name: '¿Qué necesitas?' })).toBeVisible({ timeout: 15_000 });
  await pickFirstSlot(patient, 'EXISTING');
  await patient.getByLabel('Nombre', { exact: true }).fill('Gabriel');
  await patient.getByLabel('Apellido', { exact: true }).fill(`Rondón${suffix}`);
  await fillDate(patient, 'Fecha de nacimiento', '1991-03-08');
  await patient.getByLabel('Email', { exact: true }).fill(`gabriel.${suffix}@example.com`);
  await patient.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(patient.getByLabel('Código de 6 cifras')).toBeFocused({ timeout: 15_000 });
  await expect(patient.getByText(/Si los datos coinciden con una ficha/)).toBeVisible();
  expect(await axeViolations(patient, patient.locator('main'))).toEqual([]);
  await shot(patient, 'dx016-reservar-codigo', 390);
  await ctx.close();

  // --- Recepción (el ADMIN): Pendientes de Inicio lleva a la bandeja ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, email, password);
  await page.goto(`${origin}/dashboard`);
  const pending = page.getByTestId('pending-online-requests');
  await expect(pending).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('pending-online-requests-value')).toHaveText('1');
  await pending.scrollIntoViewIfNeeded();
  await shot(page, 'dx016-pendientes', 1440);
  await pending.getByRole('link', { name: 'Solicitudes online' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitudes online' })).toBeVisible();
  await expect(page.getByText(`Gabriel Rondón${suffix}`)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'dx016-bandeja', 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitudes online' })).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(`Gabriel Rondón${suffix}`) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Por revisar');
  expect(await axeViolations(page, page.locator('main'))).toEqual([]);
  await shot(page, 'dx016-bandeja', 1440);
  await row.getByRole('button', { name: /Acciones de/ }).click();
  await page.getByRole('menuitem', { name: 'Aceptar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aceptar la solicitud' });
  await shot(page, 'dx016-bandeja-aceptar', 1440);
  await dialog.getByRole('button', { name: 'Aceptar y agendar' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('No hay solicitudes por revisar')).toBeVisible();

  const accepted = await onlineAppointments(page, session);
  expect(accepted).toHaveLength(1);

  // Sede sin horario: online no ofrece ninguna hora (la agenda interna sí la dejaría libre).
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/reservar`);
  await page.getByRole('radio', { name: new RegExp(TYPE_NAME) }).check();
  await page.getByRole('radio', { name: /Sí, es mi primera vez/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('No hay horas libres en estos días')).toBeVisible({ timeout: 15_000 });
  expect(await axeViolations(page, page.locator('main'))).toEqual([]);
  await shot(page, 'dx016-reservar-sin-huecos', 390);
});

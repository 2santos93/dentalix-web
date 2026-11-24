import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { SEDE_TODAY_TZ, atSede, sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { E2E_DATABASE_URL, moveAppointmentToNow } from './support/db';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { E2E_TODAY_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-265: «Ya llegué» contra la API real. El paciente avisa de su
 * llegada desde el enlace de su cita y con el QR de la sede (documento +
 * fecha de nacimiento); recepción lo ve en «En clínica» con la marca «Llegó
 * por su cuenta» y sus pendientes. ADMIN genera el QR en la ficha de la sede.
 * 390 px (la página pública) y 1440 px (Ajustes y el panel), claro y oscuro,
 * axe limpio.
 *
 * Las citas se agendan por la API lejos (en 3 días, a mediodía de la sede) y
 * se traen a «dentro de 5 min» con psql: sin «ahora + N» al agendar. La sede
 * y el navegador van en `SEDE_TODAY_TZ` (lejos de su medianoche) y la sede
 * sin horario (cualquier día y hora valen).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `llegada-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Llegada', email: `luis.${suffix}@example.com` };
const digits = String(Math.abs([...suffix].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 90_000_000 + 10_000_000);
const ZONE = SEDE_TODAY_TZ;

test.use({ timezoneId: ZONE });
test.describe.configure({ mode: 'serial' });
test.skip(!E2E_DATABASE_URL, 'Necesita psql (E2E_DATABASE_URL) para traer la cita a hoy.');

let session: ApiSession;
let dentistId = '';
let locationId = '';
let qrToken = '';

async function patient(request: Parameters<typeof apiPost>[0], firstName: string, docNumber: string) {
  return apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: `Llegada${suffix}`.slice(0, 30),
    docType: 'NATIONAL_ID',
    docNumber,
    birthDate: '1985-12-01',
    sex: 'F',
    phone: '+584121234567',
  });
}

/**
 * Cita agendada en 3 días a mediodía de la sede y traída a «dentro de
 * 5 + 10·slot min» (5 min de duración): cada slot tiene su franja, así dos
 * pruebas del mismo profesional no se solapan aunque corran con un minuto de
 * diferencia (antes 5 + slot: dejaba un minuto entre citas de cinco). Todas
 * caen dentro de la ventana de «Ya llegué» (30 min antes).
 */
async function bookToday(request: Parameters<typeof apiPost>[0], patientId: string, slot: number) {
  const start = atSede(sedeDayFromToday(3), `12:${String(slot * 10).padStart(2, '0')}`, ZONE);
  const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId: dentistId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 10 * 60_000).toISOString(),
    reason: 'Control',
  });
  const link = await apiPost<{ url: string }>(request, session, `/appointments/${appt.id}/confirmation-link`, {});
  moveAppointmentToNow(appt.id, 5 + slot * 10);
  return { id: appt.id, token: new URL(link.url).pathname.split('/').pop()! };
}

async function loginInSede(page: Page) {
  await loginAs(page, origin, admin.email, password);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), locationId);
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Llegada ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  dentistId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (s) => s.fullName === dentist.fullName,
  )!.userId;
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok()).toBeTruthy();
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  locationId = ((await locations.json()) as { id: string }[])[0].id;
});

test('390 px: «Ya llegué» desde el enlace de la cita marca la llegada y manda a recepción', async ({ page, request }) => {
  const p = await patient(request, 'Josefina', `V-${digits}`);
  const appt = await bookToday(request, p.id, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/confirmar/${appt.token}`);
  const card = page.getByTestId('arrival-card');
  await expect(card).toHaveAttribute('data-state', 'AVAILABLE', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  const before = await axeInBothThemes(page, page.locator('main'));
  expect(before.light, 'axe en claro').toEqual([]);
  expect(before.dark, 'axe en oscuro').toEqual([]);
  await shot(page, 'enlace-ya-llegue', 390);

  await card.getByRole('button', { name: 'Ya llegué' }).click();
  const outcome = page.getByTestId('arrival-outcome');
  // Sin anamnesis ni autorización de datos: «pasa por recepción», sin decir qué.
  await expect(outcome).toHaveAttribute('data-result', 'SEE_RECEPTION');
  await expect(outcome).toContainText('Gracias, Josefina');
  await expect(page.getByTestId('arrival-turn')).toHaveText(/Tu turno: \d+/);
  await expect(page.locator('main')).not.toContainText(/anamnesis|consentimiento/i);
  const after = await axeInBothThemes(page, page.locator('main'));
  expect(after.light).toEqual([]);
  expect(after.dark).toEqual([]);
  await shot(page, 'enlace-llegada-marcada', 390);
});

test('1440 px: ADMIN genera el QR de la sede en su ficha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginInSede(page);
  await page.goto(`${origin}/settings/sedes/${locationId}`);
  const section = page.getByRole('region', { name: 'QR de llegada' });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.getByRole('button', { name: 'Generar QR' }).click();
  await expect(page.getByTestId('check-in-qr-fresh')).toBeVisible();
  const href = await page.getByRole('link', { name: /Imprimir cartel/ }).getAttribute('href');
  qrToken = new URLSearchParams(href!.split('#')[1]).get('t')!;
  expect(qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(section).toContainText(/Activo desde el/);
  await shot(page, 'ajustes-sede-qr', 1440);
});

test('390 px: con el QR, documento sin la letra y fecha de nacimiento; un dato malo no dice si existe', async ({
  page,
  request,
}) => {
  const p = await patient(request, 'Carmen', `V-${Number(digits) + 1}`);
  await bookToday(request, p.id, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/llegada/${qrToken}`);
  await expect(page.getByRole('heading', { name: 'Avisa de tu llegada' })).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  const form = await axeInBothThemes(page, page.locator('main'));
  expect(form.light).toEqual([]);
  expect(form.dark).toEqual([]);
  await shot(page, 'qr-formulario', 390);

  await page.getByLabel('Número de documento').fill(`V-${Number(digits) + 1}`);
  await fillDate(page, 'Fecha de nacimiento', '1985-12-02');
  await page.getByRole('button', { name: 'Ya llegué' }).click();
  await expect(page.getByTestId('check-in-no-match')).toBeVisible({ timeout: 15_000 });
  await shot(page, 'qr-sin-coincidencia', 390);

  await page.getByLabel('Número de documento').fill(String(Number(digits) + 1));
  await fillDate(page, 'Fecha de nacimiento', '1985-12-01');
  await page.getByRole('button', { name: 'Ya llegué' }).click();
  const outcome = page.getByTestId('arrival-outcome');
  await expect(outcome).toContainText('Gracias, Carmen', { timeout: 15_000 });
  await shot(page, 'qr-llegada-marcada', 390);
});

test('1440 px: «En clínica» marca a quien llegó por su cuenta y sus pendientes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginInSede(page);
  await page.goto(`${origin}/agenda/en-clinica`);
  const marks = page.getByTestId('in-clinic-self-check-in');
  await expect(marks).toHaveCount(2, { timeout: 15_000 });
  await expect(marks.filter({ hasText: 'Llegó por su cuenta · enlace' })).toHaveCount(1);
  await expect(marks.filter({ hasText: 'Llegó por su cuenta · QR' })).toHaveCount(1);
  await expect(marks.first()).toContainText('Anamnesis');
  await expectNoHorizontalScroll(page);
  await shot(page, 'en-clinica-llegada-propia', 1440);
});

test('un QR inventado: el aviso sin formulario, axe limpio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/llegada/${'X'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Este código ya no está activo' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Número de documento')).toHaveCount(0);
  const res = await axeInBothThemes(page, page.locator('main'));
  expect(res.light).toEqual([]);
  expect(res.dark).toEqual([]);
});

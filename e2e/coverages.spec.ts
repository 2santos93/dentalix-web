import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-153: catálogo de pagadores (Ajustes) y cobertura del paciente.
 *
 * ADMIN crea «Sura EPS»; RECEPCIÓN añade una cobertura vencida desde la ficha
 * (fila «Vencida» + chip «Cobertura vencida» en la cabecera), la pone vigente
 * y el chip desaparece; vencida otra vez por la API, el chip sale en la
 * tarjeta de la agenda; el listado de pacientes se filtra por pagador. Todo a
 * 390 px sin scroll horizontal y con el diálogo dentro de la pantalla.
 *
 * Con `DX153_QA_SHOTS=1` además deja capturas de QA en `DX153_QA_DIR`
 * (la CI no lo define y no escribe nada).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `coberturas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.cob.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.cob.${suffix}@example.com` };
const lastName = `Cobertura${suffix}`.slice(0, 40);
const otherLastName = `SinPlan${suffix}`.slice(0, 40);
const payerName = 'Sura EPS';
const payerOption = `${payerName} · EPS (Colombia)`;
const twoDaysAgo = sedeDayFromToday(-2);
const tomorrow = sedeDayFromToday(1);
const today = sedeDayFromToday(0);

const QA_DIR =
  process.env.DX153_QA_DIR ??
  '/Users/ncaicedo/Desktop/dentalix/.planning/clickup-handoff-audit/qa/DX-153';
const QA = process.env.DX153_QA_SHOTS === '1';

async function shot(page: Page, name: string, fullPage = false) {
  if (!QA) return;
  await page.screenshot({ path: `${QA_DIR}/${name}.png`, fullPage });
}

let session: ApiSession;
let patientId = '';
let coverageId = '';
let payerId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Coberturas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Camila',
    lastName,
    docType: 'CC',
    docNumber: `CB${suffix}`.slice(0, 20),
    sex: 'F',
  }));
  await apiPost(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: otherLastName,
    docType: 'CC',
    docNumber: `CBO${suffix}`.slice(0, 20),
    sex: 'M',
  });
});

function coverageSection(page: Page) {
  return page.getByTestId('patient-coverage');
}

test('ADMIN crea «Sura EPS» en Ajustes y la ve activa; a 390 px sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/pagadores`);

  await page.getByRole('button', { name: 'Nuevo pagador' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo pagador' });
  await dialog.getByLabel('Nombre').fill(payerName);
  await dialog.getByLabel('Tipo').selectOption('EPS_CO');
  await dialog.getByLabel('País').selectOption('CO');
  await dialog.getByRole('button', { name: 'Crear pagador' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const table = page.getByRole('table', { name: 'Pagadores' });
  const row = table.getByRole('row', { name: new RegExp(payerName) });
  await expect(row).toContainText('EPS (Colombia)');
  await expect(row).toContainText('Colombia');
  await expect(row.getByText('Activo', { exact: true })).toBeVisible();
  await shot(page, 'ajustes-pagadores-1440');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(payerName).locator('visible=true').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'ajustes-pagadores-390');

  const list = await page.request.get(`${API_URL}/payers`, { headers: session.headers });
  const payers = (await list.json()) as { id: string; name: string }[];
  payerId = payers.find((p) => p.name === payerName)!.id;
});

test('RECEPCIÓN añade una cobertura vencida: fila «Vencida» y chip en la cabecera; al ponerla vigente el chip desaparece', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const section = coverageSection(page);
  await expect(section.getByText('Sin cobertura registrada')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('coverage-chip')).toHaveCount(0);

  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await dialog.getByLabel('Pagador').selectOption({ label: payerOption });
  await dialog.getByLabel('Plan').fill('Plan Complementario');
  await dialog.getByLabel('Número de afiliado').fill('987654');
  await dialog.getByLabel('Vigente hasta').fill(twoDaysAgo);
  await shot(page, 'dialogo-cobertura-1440');
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = section.getByTestId('coverage-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(payerName);
  await expect(row).toContainText('Plan Complementario');
  await expect(row).toContainText('Afiliado n.º 987654');
  await expect(row.getByText('Vencida', { exact: true })).toBeVisible();
  await expect(row.getByText('Principal', { exact: true })).toBeVisible();
  const chip = page.getByTestId('coverage-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('Cobertura vencida');
  await expectNoHorizontalScroll(page);
  await shot(page, 'ficha-cobertura-1440', true);

  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'ficha-cobertura-dark-1440', true);
  await page.emulateMedia({ colorScheme: 'light' });

  // Edita «Vigente hasta» a mañana: la cobertura vuelve a estar vigente.
  await row.getByRole('button', { name: `Editar la cobertura de ${payerName}` }).click();
  const edit = page.getByRole('dialog', { name: 'Editar cobertura' });
  await edit.getByLabel('Vigente hasta').fill(tomorrow);
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toBeHidden({ timeout: 10_000 });

  await expect(section.getByTestId('coverage-row').getByText('Vencida', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('coverage-chip')).toHaveCount(0);

  const covers = await page.request.get(`${API_URL}/patients/${patientId}/coverages`, {
    headers: session.headers,
  });
  coverageId = ((await covers.json()) as { id: string }[])[0].id;
});

test('390 px: la ficha con cobertura no se desplaza y el diálogo cabe en la pantalla', async ({
  page,
  request,
}) => {
  // Vencida otra vez por la API (el estado se calcula con el día civil de la sede).
  const patched = await request.patch(`${API_URL}/patients/${patientId}/coverages/${coverageId}`, {
    headers: session.headers,
    data: { validTo: twoDaysAgo },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const section = coverageSection(page);
  await expect(section.getByText('Vencida', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('coverage-chip')).toContainText('Cobertura vencida');
  await expectNoHorizontalScroll(page);
  await shot(page, 'ficha-cobertura-390', true);

  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

test('una cita de hoy con cobertura vencida muestra el chip en la agenda', async ({ page, request }) => {
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === admin.fullName)!.userId;
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId,
    start: atSede(today, '22:00').toISOString(),
    end: atSede(today, '23:00').toISOString(),
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(today);

  const card = page.getByTestId('day-column-appointment').filter({ hasText: `Camila ${lastName}` });
  await expect(card).toBeVisible({ timeout: 15_000 });
  // Una cita de una hora: en una de 30 min la tarjeta recorta el chip (lo lleva el aria-label).
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByTestId('coverage-chip')).toBeVisible();
  await expect(card.getByTestId('coverage-chip')).toContainText('Cobertura vencida');
  await shot(page, 'agenda-chip-1440');
});

test('el listado de pacientes filtrado por «Sura EPS» muestra solo a ese paciente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients`);

  await expect(page.getByText(otherLastName).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(lastName).first()).toBeVisible();

  const select = page.getByRole('combobox', { name: 'Filtrar por pagador' });
  await expect(select.locator('option', { hasText: payerName })).toHaveCount(1);
  await select.selectOption(payerId);

  await expect(page.getByText(otherLastName)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText(lastName).first()).toBeVisible();
  await shot(page, 'listado-filtro-1440');

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
});

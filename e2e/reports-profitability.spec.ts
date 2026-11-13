import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { DAY_MS, SEDE_TZ } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { civilDateInZone } from '../src/lib/format/date';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e DX-410 — «Reportes» → «Rentabilidad», sin mocks, en una clínica nueva
 * (una sede en USD). Hace 3 días (dentro de «Últimos 30 días» sea cual sea el
 * reloj de la CI): un abono de USD 130, un gasto de Laboratorio de USD 45
 * pagado ese día y uno de Mantenimiento de USD 200 sin pagar.
 *  - Caja: cobrado 130 − gastos pagados 45 = 85.
 *  - Devengo: producción 0 − gastos facturados 245 = −115.
 *  1. 1440 px: la base en la cabecera, la sede y el total, y el detalle de
 *     un importe (el proveedor del gasto, sin datos del paciente).
 *  2. Devengo, con el gasto sin pagar.
 *  3. 390 px: tarjetas por sede, sin scroll horizontal.
 *  4. Un período sin movimientos: el vacío.
 * Capturas a 1440 y 390 en test-results (QA).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `test-rentab-${suffix}`;
const email = `rentab.${suffix}@example.com`;
const password = 'Password123!';
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const DAY = civilDateInZone(new Date(Date.now() - 3 * DAY_MS), SEDE_TZ) ?? '';
const PATIENT_LAST_NAME = `Rentab${suffix}`;
const SUPPLIER = `Laboratorio Ávila ${suffix}`;
const SUMMARY = 'Rentabilidad por sede en USD';

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let locationName: string;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Rentabilidad ${suffix}`,
    fullName: 'Dra. Rentabilidad',
    email,
    password,
  });
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    id: string;
    name: string;
  }[];
  locationName = locations[0].name;

  // Un abono de USD 130 a un plan.
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName: PATIENT_LAST_NAME,
    docType: 'NATIONAL_ID',
    docNumber: `RT${suffix}`,
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `RT-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Resina ${suffix}`,
    color: '#3366CC',
    defaultPrice: 130,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accepted = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accepted.ok()).toBeTruthy();
  await apiPost(request, session, `/treatment-plans/${plan.id}/payments`, {
    amount: 130,
    currency: 'USD',
    paidAt: DAY,
    method: 'TRANSFER',
  });

  // Gastos: uno pagado ese día y otro sin pagar.
  const expense = (data: object) =>
    apiPost(request, { ...session, headers: { ...session.headers, 'Idempotency-Key': randomUUID() } }, '/expenses', {
      locationId: locations[0].id,
      currency: 'USD',
      invoiceDate: DAY,
      ...data,
    });
  await expense({
    category: 'Laboratorio',
    supplier: SUPPLIER,
    amount: 45,
    payment: { amount: 45, method: 'TRANSFER', paidOn: DAY },
  });
  await expense({ category: 'Mantenimiento', supplier: `Servicio técnico ${suffix}`, amount: 200 });
});

async function openTab(page: Page, query = '&periodo=last_30_days'): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}/reportes?tab=rentabilidad${query}`);
  await expect(page.getByRole('tab', { name: 'Rentabilidad', selected: true })).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`dx410-${name}.png`), fullPage: true, animations: 'disabled' });
}

test('1440 px: Caja por sede y total, con el detalle de cada importe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page);
  await expect(page.getByRole('heading', { name: 'Rentabilidad en base Caja' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('profitability-header')).toContainText('cobrado − gastos pagados, por fecha de pago');
  const table = page.getByRole('table', { name: SUMMARY });
  const sede = table.getByRole('row').filter({ hasText: locationName });
  await expect(sede).toContainText(money(130));
  await expect(sede).toContainText(money(45));
  await expect(sede).toContainText(money(85));
  await expect(table.getByRole('row').filter({ hasText: 'Total del grupo' })).toContainText(money(85));
  // Por categoría: solo lo pagado en el período.
  const categories = page.getByRole('table', { name: 'Gastos por categoría en USD' });
  await expect(categories).toContainText('Laboratorio');
  await expect(categories).not.toContainText('Mantenimiento');
  await expect(page.getByRole('main')).not.toContainText(PATIENT_LAST_NAME);
  await expectNoHorizontalScroll(page);
  await shot(page, 'caja-1440');

  await sede.getByRole('button', { name: /gastos pagados de/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('profitability-line')).toHaveCount(1, { timeout: 30_000 });
  await expect(dialog).toContainText(SUPPLIER);
  await expect(dialog).toContainText(money(45));
  await shot(page, 'detalle-1440');
});

test('Devengo: gastos por fecha de factura, pagados o no', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page);
  await expect(page.getByRole('heading', { name: 'Rentabilidad en base Caja' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Devengo' }).click();
  await expect(page).toHaveURL(/base=devengo/);
  await expect(page.getByRole('heading', { name: 'Rentabilidad en base Devengo' })).toBeVisible({ timeout: 30_000 });
  const sede = page.getByRole('table', { name: SUMMARY }).getByRole('row').filter({ hasText: locationName });
  await expect(sede).toContainText(money(245));
  await expect(sede).toContainText(money(-115));
  await expect(page.getByRole('table', { name: 'Gastos por categoría en USD' })).toContainText('Mantenimiento');
  await shot(page, 'devengo-1440');
});

test('390 px: una tarjeta por sede y el total, sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page);
  const list = page.getByRole('list', { name: SUMMARY });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toContainText(money(85));
  await expectNoHorizontalScroll(page);
  await shot(page, 'caja-390');
});

test('un período sin movimientos enseña el vacío', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page, '&periodo=custom&desde=2020-01-01&hasta=2020-01-31');
  await expect(page.getByText('Sin ingresos ni gastos')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: SUMMARY })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shot(page, 'vacio-390');
});

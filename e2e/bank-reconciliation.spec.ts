import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { sedeDayFromToday } from './support/clock';
import { axeInBothThemes } from './support/axe';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';

/**
 * e2e (DX-571): Caja › Conciliación, en una clínica nueva (sin cuentas).
 *
 *   1. La administradora ve el vacío que explica qué es una cuenta, la crea
 *      en bolívares (VES) con su «Pago móvil» (pide referencia).
 *   2. Sube el extracto (CSV con «;» y coma decimal): mapea las columnas, la
 *      vista previa cuenta 2 entradas nuevas y 1 salida ignorada, e importa.
 *   3. El abono con la misma referencia (004512) e importe (4.500,00) queda
 *      en «Conciliados» solo; el movimiento 009988 sale en «Sin abono» y se
 *      empareja a mano con el abono de 7.250,00 (otra referencia) desde
 *      «Emparejar con un abono…»; después «Sin abono» queda vacío.
 *   4. Caja › Abonos marca los dos abonos «Conciliado».
 * Accesibilidad (axe) en claro y oscuro, sin scroll horizontal a 1440 y 390,
 * y capturas en claro/oscuro con `E2E_QA_DIR`.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const PASSWORD = 'Conciliar-2026!';

async function send<T>(
  request: APIRequestContext,
  session: ApiSession,
  method: 'patch' | 'get',
  path: string,
  data?: object,
) {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, ...(data ? { data } : {}) });
  expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** «Pago móvil» que pide referencia (el de la clínica nueva, o uno creado). */
async function seedMobilePayment(
  request: APIRequestContext,
  session: ApiSession,
): Promise<{ id: string; name: string }> {
  const methods = await send<{ id: string; name: string }[]>(request, session, 'get', '/payment-methods');
  const existing = methods.find((m) => m.name === 'Pago móvil');
  if (existing) {
    await send(request, session, 'patch', `/payment-methods/${existing.id}`, {
      requiresReference: true,
      proofPolicy: 'NONE',
    });
    return existing;
  }
  return apiPost<{ id: string; name: string }>(request, session, '/payment-methods', {
    name: 'Pago móvil',
    kind: 'DIGITAL',
    requiresReference: true,
    proofPolicy: 'NONE',
    allowInPaymentLink: false,
  });
}

/** Paciente con un plan aceptado y un abono por pago móvil en bolívares. */
async function seedPayment(
  request: APIRequestContext,
  session: ApiSession,
  opts: {
    firstName: string;
    catalogItemId: string;
    methodId: string;
    amount: number;
    reference: string;
    paidAt: string;
  },
) {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: opts.firstName,
    lastName: `Banco${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `V571${opts.reference}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: E2E_REGION.currency,
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: opts.catalogItemId,
    price: 900,
  });
  await send(request, session, 'patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  return apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/payments`, {
    amount: opts.amount,
    currency: 'VES',
    paidAt: opts.paidAt,
    paymentMethodId: opts.methodId,
    reference: opts.reference,
  });
}

function dmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

test.describe('conciliación con el extracto del banco (DX-571)', () => {
  test('cuenta → extracto → conciliados solos → emparejar a mano → distintivo en Abonos', async ({ page }) => {
    test.setTimeout(180_000);
    const email = `admin.banco.${suffix}@example.com`;
    const session = await registerClinicViaApi(page.request, {
      subdomain: `banco571-${suffix}`,
      clinicName: `Clinica Banco ${suffix}`,
      fullName: 'Dra Conciliación',
      email,
      password: PASSWORD,
      location: E2E_REGION,
    });
    const origin = session.origin;
    const today = sedeDayFromToday(0);
    const method = await seedMobilePayment(page.request, session);
    const catalog = await apiPost<{ id: string }>(page.request, session, '/catalog/items', {
      code: `dx571-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Corona DX571 ${suffix}`,
      color: '#3366CC',
      defaultPrice: 900,
    });
    await seedPayment(page.request, session, {
      firstName: 'María',
      catalogItemId: catalog.id,
      methodId: method.id,
      amount: 4500,
      reference: '004512',
      paidAt: today,
    });
    await seedPayment(page.request, session, {
      firstName: 'Luis',
      catalogItemId: catalog.id,
      methodId: method.id,
      amount: 7250,
      reference: '771100',
      paidAt: today,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, email, PASSWORD);
    await page.goto(`${origin}/caja?tab=conciliacion`);
    const panel = page.getByRole('tabpanel', { name: 'Conciliación' });

    // 1. Vacío que explica y alta de la cuenta.
    await expect(panel.getByText('Aún no hay cuentas de conciliación')).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalScroll(page);
    await shot(page, 'empty', 1440);
    await panel.getByRole('button', { name: 'Crear cuenta' }).click();
    const accountForm = page.getByRole('dialog', { name: 'Nueva cuenta de conciliación' });
    await accountForm.getByLabel('Nombre de la cuenta').fill('Cuenta corriente en bolívares');
    await accountForm.getByLabel('Moneda', { exact: true }).selectOption('VES');
    await accountForm.getByRole('checkbox', { name: method.name }).check();
    await expectDialogInsideViewport(page, accountForm);
    await shot(page, 'account', 1440);
    await accountForm.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(accountForm).toBeHidden({ timeout: 15_000 });
    await expect(panel.getByRole('heading', { name: 'Cuenta corriente en bolívares' })).toBeVisible();

    // 2. Subir el extracto: columnas, vista previa e importar.
    await panel.getByRole('button', { name: 'Subir extracto' }).click();
    const wizard = page.getByRole('dialog', { name: 'Subir extracto del banco' });
    const csv = [
      'Fecha;Referencia;Concepto;Monto',
      `${dmy(today)};004512;Pago móvil recibido;4.500,00`,
      `${dmy(today)};009988;Pago móvil recibido;7.250,00`,
      `${dmy(today)};551200;Comisión bancaria;-1.000,00`,
    ].join('\n');
    await wizard.getByLabel('Extracto del banco (CSV o .xlsx)').setInputFiles({
      name: 'extracto-octubre.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await expect(wizard.getByLabel(/^Fecha/)).toBeVisible({ timeout: 20_000 });
    await wizard.getByLabel(/^Fecha/).selectOption('Fecha');
    await wizard.getByLabel(/^Referencia/).selectOption('Referencia');
    await wizard.getByLabel(/^Importe con signo/).selectOption('Monto');
    await wizard.getByLabel(/^Descripción/).selectOption('Concepto');
    await wizard.getByLabel('Orden de la fecha').selectOption('DMY');
    await wizard.getByLabel('Separador de los decimales').selectOption(',');
    await shot(page, 'mapping', 1440);
    await wizard.getByRole('button', { name: 'Ver vista previa' }).click();
    const totals = wizard.getByRole('region', { name: 'Vista previa' });
    await expect(totals).toBeVisible({ timeout: 20_000 });
    await expect(totals.locator('dt:has-text("Entradas nuevas") + dd')).toHaveText('2');
    await expect(totals.locator('dt:has-text("Salidas ignoradas") + dd')).toHaveText('1');
    await expect(dataList(totals, 'Primeras entradas del extracto')).toContainText('004512');
    await shot(page, 'preview', 1440);
    await wizard.getByRole('button', { name: 'Importar 2 movimientos' }).click();
    await expect(wizard).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText('Extracto importado: 2 movimientos nuevos, 1 conciliado solo.')).toBeVisible();

    // 3. Conciliados solos y emparejar a mano el que no tiene abono.
    await expect(panel.getByRole('radio', { name: 'Conciliados 1' })).toBeChecked({ timeout: 15_000 });
    const conciliated = dataList(panel, 'Movimientos conciliados');
    await expect(dataListRows(conciliated).filter({ hasText: '004512' })).toContainText('María');
    await expect(panel.getByRole('radio', { name: 'Sin abono 1' })).toBeVisible();
    const lists = await axeInBothThemes(page, panel);
    expect(lists.light, 'axe en claro').toEqual([]);
    expect(lists.dark, 'axe en oscuro').toEqual([]);
    await expectNoHorizontalScroll(page);
    await shot(page, 'lists', 1440);

    await page.setViewportSize({ width: 390, height: 844 });
    await panel.getByRole('radio', { name: /^Sin abono/ }).check();
    const pending = dataList(panel, 'Movimientos sin abono');
    const row = dataListRows(pending).filter({ hasText: '009988' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await shot(page, 'sin-abono', 390);
    await rowAction(page, row, 'Emparejar con un abono…');
    const candidates = page.getByRole('dialog', { name: 'Emparejar con un abono' });
    const option = candidates.getByRole('radio', { name: /Luis/ });
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expectDialogInsideViewport(page, candidates);
    const modalAxe = await axeInBothThemes(page, candidates);
    expect(modalAxe.light, 'axe del modal en claro').toEqual([]);
    expect(modalAxe.dark, 'axe del modal en oscuro').toEqual([]);
    await shot(page, 'candidates', 390);
    await option.check();
    await candidates.getByRole('button', { name: 'Emparejar' }).click();
    await expect(candidates).toBeHidden({ timeout: 15_000 });
    await expect(panel.getByText('Ningún movimiento sin abono en el período')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole('radio', { name: 'Conciliados 2' })).toBeVisible();
    await panel.getByRole('radio', { name: /^Conciliados/ }).check();
    await expect(dataListRows(dataList(panel, 'Movimientos conciliados')).filter({ hasText: '009988' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    const mobileAxe = await axeInBothThemes(page, panel);
    expect(mobileAxe.light, 'axe a 390 en claro').toEqual([]);
    expect(mobileAxe.dark, 'axe a 390 en oscuro').toEqual([]);
    await shot(page, 'lists', 390);

    // 4. Caja › Abonos: los dos abonos llevan «Conciliado».
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('tab', { name: 'Abonos' }).click();
    await expect(page.getByTestId('reconciled-badge')).toHaveCount(2, { timeout: 15_000 });
    await shot(page, 'abonos', 1440);
  });
});

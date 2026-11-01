import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AxeResults } from 'axe-core';
import { test, expect, type Locator, type Page, type TestInfo } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { DEMO_CURRENCY, DEMO_REGION } from './support/demo';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e (DX-274): la pantalla «Gastos» de la sede (solo ADMIN).
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - «Gastos»: la administradora registra un gasto en el modal (sin categoría
 *     no deja), lo encuentra con la búsqueda, abre su detalle, le registra un
 *     pago parcial por transferencia (queda «Parcial»), anula ese pago y luego
 *     el gasto con motivo (queda «Anulado», tachado); y exporta el CSV de la
 *     lista con BOM y el gasto dentro;
 *   - «Resumen»: con un gasto del mes por la API, la fila del mes en curso de
 *     la sede enseña el total de gastos que da la API, se despliega por
 *     categoría y el CSV del resumen se descarga.
 * A 1440 y 390 px (sin scroll horizontal), con axe (serias o críticas) y
 * capturas en claro y oscuro (DX274_QA_DIR o test-results).
 *
 * El alta con pago «Desde mi caja abierta» y la anulación de una salida de una
 * caja cerrada viven en cash-outflow.spec.ts, junto al resto de la caja.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const origin = tenantOrigin(DEMO_SUBDOMAIN);

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

const BOM = '﻿';

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * Contrastes que ya fallaban antes de DX-274, en piezas compartidas que esta
 * tarea no cambia: se guardan en `axe-*.json` y se cuentan aparte, pero no
 * hacen fallar el test. Cualquier otra violación seria o crítica sí.
 */
const PREEXISTING_CONTRAST: { matches: (node: { html: string; target: unknown[] }) => boolean; why: string }[] = [
  // Badge tintado (`bg-success-subtle text-success-text`, etc.): 4.08–4.09:1 en claro,
  // como «Abierta» en la lista de turnos de la Caja.
  { matches: (n) => /class="[^"]*\bbg-(success|warning|danger)\/15\b/.test(n.html), why: 'Badge tintado del sistema' },
  // (El Button `destructive` en oscuro, 2.69:1 con texto blanco, se corrigió
  // en DX-343 con `--color-danger-fg`: ya no se exime.)
  // Rótulo de ámbito bajo la cabecera (`text-muted` sobre `bg-surface-2`,
  // 4.34:1 en claro), el mismo de Cartera, Descuentos y Caja.
  { matches: (n) => /^<span>(Toda la clínica|Gastos de .+)<\/span>$/.test(n.html), why: 'Rótulo de ámbito de PageHeader' },
];

function isPreexisting(id: string, node: { html: string; target: unknown[] }): boolean {
  return id === 'color-contrast' && PREEXISTING_CONTRAST.some((p) => p.matches(node));
}

/**
 * axe (violaciones serias o críticas) sobre `scope` y captura de la página
 * entera. El ratón sale de encima de los botones: un `hover` a medio color no
 * es el reposo.
 */
async function audit(page: Page, evidence: string, surface: string, scope: Locator) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.querySelector('[data-axe-scope]')?.removeAttribute('data-axe-scope'));
  await scope.evaluate((el) => el.setAttribute('data-axe-scope', ''));
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await page.evaluate(axeSource);
  const results = await page.evaluate(async (include) => {
    const axe = (window as unknown as { axe: { run: (context: string) => Promise<AxeResults> } }).axe;
    return axe.run(include);
  }, '[data-axe-scope]');
  writeFileSync(path.join(evidence, `axe-${surface}.json`), JSON.stringify(results.violations, null, 2));
  await page.screenshot({ path: path.join(evidence, `${surface}.png`), fullPage: true });
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.filter((n) => !isPreexisting(v.id, n)).map((n) => n.target),
    }))
    .filter((v) => v.nodes.length > 0);
}

/** axe y captura de `scope` en claro y en oscuro; vuelve a claro al acabar. */
async function auditBothSchemes(page: Page, evidence: string, surface: string, scope: Locator) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    expect.soft(await audit(page, evidence, `${surface}-${colorScheme}`, scope)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

function evidenceDir(testInfo: TestInfo): string {
  const dir = process.env.DX274_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Un gasto por la API (sin pagos). */
async function expenseViaApi(
  page: Page,
  admin: ApiSession,
  body: { category: string; supplier: string; amount: number; invoiceDate: string },
): Promise<{ id: string }> {
  const res = await page.request.post(`${API_URL}/expenses`, {
    headers: { ...admin.headers, 'Idempotency-Key': randomUUID() },
    data: { currency: DEMO_CURRENCY, ...body },
  });
  expect(res.ok(), `gasto por la API falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as { id: string };
}

/** Hoy en la sede principal, en su zona (la de la API, DX-097): `AAAA-MM-DD`. */
async function sedeToday(page: Page, admin: ApiSession): Promise<string> {
  const res = await page.request.get(`${API_URL}/locations`, { headers: admin.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const [principal] = (await res.json()) as { timeZone: string }[];
  return new Intl.DateTimeFormat('en-CA', { timeZone: principal.timeZone }).format(new Date());
}

async function openGastos(page: Page, tab?: 'resumen'): Promise<void> {
  await loginAs(page, origin, ADMIN_EMAIL, DEMO_PASSWORD);
  await page.goto(`${origin}/caja/gastos${tab ? `?tab=${tab}` : ''}`);
  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`ADMIN registra un gasto, lo paga en parte, anula el pago y el gasto, y exporta el CSV (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const evidence = evidenceDir(testInfo);
    const narrow = viewport.width === 390;
    const tag = `${suffix}${viewport.width}`;
    const supplier = `Laboratorio Dental ${tag}`;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await openGastos(page);
    await expect(page.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true');
    // La lista del mes ya cargó (el recuento sale con la primera página).
    await expect(page.getByText(/^\d+ gastos?$/)).toBeVisible({ timeout: 15_000 });
    if (narrow) await expectNoHorizontalScroll(page);

    // El alta: sin categoría no deja.
    await page.getByRole('button', { name: 'Nuevo gasto' }).click();
    const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
    if (narrow) await expectDialogInsideViewport(page, form);
    await expect(form.getByRole('option', { name: 'Laboratorio' })).toBeAttached({ timeout: 15_000 });
    await form.getByRole('button', { name: 'Registrar gasto' }).click();
    await expect(form.getByText('Elige una categoría.')).toBeVisible();
    await form.getByLabel('Moneda').selectOption(DEMO_CURRENCY);
    await form.getByLabel('Categoría').selectOption('Laboratorio');
    await form.getByLabel('Proveedor').fill(supplier);
    await form.getByLabel('Descripción').fill('Coronas de zirconio, paciente de prueba');
    await form.getByLabel('Importe').fill('150');
    await auditBothSchemes(page, evidence, `expense-form-${viewport.width}`, form);
    await form.getByRole('button', { name: 'Registrar gasto' }).click();
    await expect(form).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Gasto registrado.')).toBeVisible();

    // La búsqueda lo deja solo; sale «Pendiente».
    await page.getByLabel('Buscar por proveedor o descripción').fill(supplier);
    await expect(page.getByText('1 gasto', { exact: true })).toBeVisible({ timeout: 15_000 });
    const listing = page.getByRole(narrow ? 'list' : 'table', { name: /^Gastos del periodo/ });
    await expect(listing).toContainText(supplier);
    await expect(listing).toContainText('Pendiente');
    await expect(listing).toContainText('150,00');
    if (narrow) await expectNoHorizontalScroll(page);
    await auditBothSchemes(page, evidence, `expenses-list-${viewport.width}`, page.locator('main'));

    // El CSV de la lista: con BOM y el gasto dentro.
    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const csvText = readFileSync(await csv.path(), 'utf8');
    expect(csvText.startsWith(BOM)).toBe(true);
    expect(csvText).toContain(supplier);
    expect(csvText).toContain('\r\n');
    await expect(page.getByText('Gastos exportados.')).toBeVisible();

    // El detalle.
    await listing.getByRole('button', { name: /^Laboratorio/ }).click();
    const detail = page.getByRole('dialog', { name: `Laboratorio · ${supplier}` });
    await expect(detail.getByRole('heading', { name: 'Pagos' })).toBeVisible({ timeout: 15_000 });
    await expect(detail.getByText('Aún no tiene pagos.')).toBeVisible();
    if (narrow) await expectDialogInsideViewport(page, detail);

    // Un pago parcial por transferencia.
    await detail.getByRole('button', { name: 'Registrar pago' }).click();
    const pay = page.getByRole('dialog', { name: 'Registrar pago' });
    await expect(pay.getByText(/Pendiente: 150,00/)).toBeVisible();
    await pay.getByLabel('Medio de pago').selectOption({ label: 'Transferencia' });
    await expect(pay.getByLabel('Desde mi caja abierta')).toHaveCount(0);
    await pay.getByLabel(`Importe (${DEMO_CURRENCY})`).fill('200');
    await pay.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(pay.getByText(/El pago supera lo pendiente del gasto/)).toBeVisible();
    await pay.getByLabel(`Importe (${DEMO_CURRENCY})`).fill('50');
    await pay.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(pay).toBeHidden({ timeout: 15_000 });
    await expect(detail.getByText(/Pago de 50,00\sUSD registrado\./)).toBeVisible();
    await expect(detail.getByText(/Transferencia/)).toBeVisible();
    await expect(detail).toContainText('Parcial');
    await auditBothSchemes(page, evidence, `expense-detail-${viewport.width}`, detail);

    // Anular el pago: el motivo es obligatorio.
    await detail.getByRole('button', { name: /^Anular el pago de 50,00/ }).click();
    const voidPayment = page.getByRole('dialog', { name: '¿Anular este pago?' });
    await voidPayment.getByRole('button', { name: 'Anular pago' }).click();
    await expect(voidPayment.getByText('Escribe el motivo (al menos 5 caracteres).')).toBeVisible();
    await voidPayment.getByLabel('Motivo de la anulación').fill(`Transferencia rechazada ${tag}`);
    await voidPayment.getByRole('button', { name: 'Anular pago' }).click();
    await expect(voidPayment).toBeHidden({ timeout: 15_000 });
    await expect(detail.getByText('Pago anulado.')).toBeVisible();
    await expect(detail.getByText(`Transferencia rechazada ${tag}`)).toBeVisible();
    await expect(detail).toContainText('Pendiente');

    // Anular el gasto.
    await detail.getByRole('button', { name: 'Anular gasto' }).click();
    const voidExpense = page.getByRole('dialog', { name: '¿Anular este gasto?' });
    if (narrow) await expectDialogInsideViewport(page, voidExpense);
    await voidExpense.getByLabel('Motivo de la anulación').fill(`Factura duplicada ${tag}`);
    await auditBothSchemes(page, evidence, `expense-void-${viewport.width}`, voidExpense);
    await voidExpense.getByRole('button', { name: 'Anular gasto' }).click();
    await expect(voidExpense).toBeHidden({ timeout: 15_000 });
    await expect(detail.getByText('Gasto anulado.')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Anular gasto' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await expect(listing).toContainText('Anulado');

    // El filtro de estado lo encuentra entre los anulados.
    await page.getByLabel('Estado').selectOption({ label: 'Anulados' });
    await expect(page.getByText('1 gasto', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Estado').selectOption({ label: 'Por pagar' });
    await expect(page.getByText('No hay gastos en este periodo')).toBeVisible({ timeout: 15_000 });
    if (narrow) await expectNoHorizontalScroll(page);
  });
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`el resumen enseña ingresos contra gastos del mes y exporta el CSV (${viewport.name})`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence = evidenceDir(testInfo);
    const narrow = viewport.width === 390;
    const supplier = `Papelería Central ${suffix}${viewport.width}`;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const admin = await apiLogin(page.request, origin, ADMIN_EMAIL, DEMO_PASSWORD);

    // Dos gastos de hoy en la sede principal.
    const today = await sedeToday(page, admin);
    await expenseViaApi(page, admin, { category: 'Insumos clínicos', supplier, amount: 100, invoiceDate: today });
    await expenseViaApi(page, admin, { category: 'Papelería', supplier, amount: 432.1, invoiceDate: today });

    // Lo que dice la API del resumen es lo que tiene que pintar la pantalla.
    const summary = page.waitForResponse((res) => /\/expenses\/summary\?/.test(res.url()) && res.ok());
    await openGastos(page, 'resumen');
    await expect(page.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
    const { rows } = (await (await summary).json()) as {
      rows: {
        month: string;
        locationName: string;
        currency: string;
        expensesTotal: number;
        categories: { category: string; amount: number }[];
      }[];
    };
    const month = today.slice(0, 7);
    const row = rows.find(
      (r) => r.month === month && r.currency === DEMO_CURRENCY && r.categories.some((c) => c.category === 'Papelería'),
    );
    expect(row, `fila del resumen de ${month} con Papelería`).toBeTruthy();
    const papeleria = row!.categories.find((c) => c.category === 'Papelería')!;
    expect(papeleria.amount).toBeGreaterThanOrEqual(432.1);

    const table = page.getByRole('table', { name: 'Ingresos y gastos por mes, sede y moneda' });
    await expect(table).toBeVisible({ timeout: 15_000 });
    const totalText = regionalFormat(DEMO_REGION).number(row!.expensesTotal, { min: 2, max: 2 });
    const toggle = table.getByRole('button', {
      // DX-378 (FE-078): separadores de la sede (es-VE) y siempre el código de la moneda, nunca «$».
      name: new RegExp(`^Ver gastos por categoría de .+, ${row!.locationName}: ${DEMO_CURRENCY}\\s${totalText.replace(/\./g, '\\.')}`),
    });
    await expect(toggle).toBeVisible();
    if (narrow) await expectNoHorizontalScroll(page);
    await auditBothSchemes(page, evidence, `summary-${viewport.width}`, page.locator('main'));

    await toggle.click();
    const breakdown = table.getByRole('list', { name: 'Gastos por categoría' });
    await expect(breakdown).toContainText('Papelería');
    await expect(breakdown).toContainText('Insumos clínicos');
    await expect(table.getByRole('button', { name: /^Ocultar gastos por categoría de / })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    if (narrow) await expectNoHorizontalScroll(page);
    await auditBothSchemes(page, evidence, `summary-open-${viewport.width}`, page.locator('main'));

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const csvText = readFileSync(await csv.path(), 'utf8');
    expect(csvText.startsWith(BOM)).toBe(true);
    expect(csvText).toContain(month);
    expect(csvText).toContain(row!.locationName);
    expect(csvText).toContain('\r\n');
    await expect(page.getByText('Resumen exportado.')).toBeVisible();

    writeFileSync(path.join(evidence, `summary-${viewport.width}.csv`), csvText);
  });
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AxeResults } from 'axe-core';
import { test, expect, type Locator, type Page, type TestInfo } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { DEMO_ADMIN_EMAIL, DEMO_CURRENCY, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';

/**
 * e2e (DX-411): «Gastos › Por proveedor», las cuentas por pagar.
 *
 * Contra la clínica DEMO: dos gastos de un proveedor propio de la corrida por
 * la API en la sede principal (uno vencido ayer y pagado en parte, otro que
 * vence en 3 días). La lista de gastos avisa de lo que vence esta semana y
 * lleva a «Por proveedor»; ahí la fila del proveedor enseña pendiente y
 * vencido, el CSV la trae, y al abrirla salen sus gastos por vencimiento con
 * «Registrar pago» (el modal de siempre). Al terminar se anulan los gastos
 * que quedan: la demo es compartida.
 * A 1440 y 390 px (sin scroll horizontal), axe (serias o críticas) y capturas
 * en claro y oscuro (DX411_QA_DIR o test-results).
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const BOM = '﻿';
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Contrastes del sistema que ya se eximían en expenses.spec.ts (no son de esta pantalla). */
function isPreexisting(id: string, node: { html: string }): boolean {
  return (
    id === 'color-contrast' &&
    (/class="[^"]*\bbg-(success|warning|danger)\/15\b/.test(node.html) ||
      /^<span>(Toda la clínica|Gastos de .+)<\/span>$/.test(node.html))
  );
}

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
    .map((v) => ({ id: v.id, nodes: v.nodes.filter((n) => !isPreexisting(v.id, n)).map((n) => n.target) }))
    .filter((v) => v.nodes.length > 0);
}

async function auditBothSchemes(page: Page, evidence: string, surface: string, scope: Locator) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    expect.soft(await audit(page, evidence, `${surface}-${colorScheme}`, scope)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

function evidenceDir(testInfo: TestInfo): string {
  const dir = process.env.DX411_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Hoy en la sede principal, en su zona: `AAAA-MM-DD`. */
async function sedeToday(page: Page, admin: ApiSession): Promise<string> {
  const res = await page.request.get(`${API_URL}/locations`, { headers: admin.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const [principal] = (await res.json()) as { timeZone: string }[];
  return new Intl.DateTimeFormat('en-CA', { timeZone: principal.timeZone }).format(new Date());
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function post(page: Page, admin: ApiSession, url: string, data: object): Promise<{ id: string }> {
  const res = await page.request.post(`${API_URL}${url}`, {
    headers: { ...admin.headers, 'Idempotency-Key': randomUUID() },
    data,
  });
  expect(res.ok(), `${url} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as { id: string };
}

/** Un importe tal como lo pinta la sede (es-VE): código y coma decimal. */
const amount = (text: string) => new RegExp(`(${DEMO_CURRENCY}\\s)?${text.replace('.', '\\.')}`);

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`cuentas por pagar por proveedor: aviso, fila, CSV y pago desde el proveedor (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const evidence = evidenceDir(testInfo);
    const narrow = viewport.width === 390;
    const supplier = `Laboratorio Ávila ${suffix}${viewport.width}`;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const admin = await apiLogin(page.request, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
    const today = await sedeToday(page, admin);
    const base = { category: 'Laboratorio', supplier, currency: DEMO_CURRENCY, invoiceDate: addDays(today, -10) };
    // Vencido ayer, 120 con 20 pagados → pendiente 100.
    const overdue = await post(page, admin, '/expenses', { ...base, amount: 120, dueDate: addDays(today, -1) });
    await post(page, admin, `/expenses/${overdue.id}/payments`, { amount: 20, method: 'TRANSFER' });
    // Vence en 3 días: entra en «7 días».
    const soon = await post(page, admin, '/expenses', {
      ...base,
      // Otra grafía (mayúsculas y espacios) cae en el mismo proveedor.
      supplier: `  ${supplier.toUpperCase()} `,
      amount: 80,
      dueDate: addDays(today, 3),
    });

    try {
      // La lista de gastos avisa de lo que vence esta semana y lleva a «Por proveedor».
      await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
      await page.goto(`${origin}/caja/gastos`);
      await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible({ timeout: 15_000 });
      const notice = page.getByTestId('expenses-due-soon');
      await expect(notice).toContainText(/vencen? en los próximos 7 días/, { timeout: 15_000 });
      if (narrow) await expectNoHorizontalScroll(page);
      await auditBothSchemes(page, evidence, `payables-notice-${viewport.width}`, notice);
      await notice.getByRole('button', { name: 'Ver por proveedor' }).click();
      await expect(page).toHaveURL(/\?tab=proveedores/);
      await expect(page.getByRole('tab', { name: 'Por proveedor' })).toHaveAttribute('aria-selected', 'true');

      // La fila del proveedor: una sola para las dos grafías, en su moneda.
      await page.getByLabel('Moneda').selectOption(DEMO_CURRENCY);
      const listing = page.getByRole(narrow ? 'list' : 'table', { name: /^Cuentas por pagar por proveedor/ });
      const row = listing.getByRole('button', { name: new RegExp(supplier, 'i') });
      await expect(row).toHaveCount(1, { timeout: 15_000 });
      const rowBox = narrow ? listing.getByRole('listitem').filter({ has: row }) : listing.getByRole('row').filter({ has: row });
      await expect(rowBox).toContainText(amount('180,00'));
      await expect(rowBox).toContainText(amount('100,00'));
      if (narrow) await expectNoHorizontalScroll(page);
      await auditBothSchemes(page, evidence, `payables-list-${viewport.width}`, page.locator('main'));

      // El CSV: mismas filas, con BOM.
      const [csv] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Exportar CSV' }).click(),
      ]);
      expect(csv.suggestedFilename()).toBe('cuentas-por-pagar.csv');
      const csvText = readFileSync(await csv.path(), 'utf8');
      expect(csvText.startsWith(BOM)).toBe(true);
      const csvLine = csvText.split('\r\n').find((l) => l.toLowerCase().includes(supplier.toLowerCase()));
      expect(csvLine, 'fila del proveedor en el CSV').toBeTruthy();
      expect(csvLine).toContain(`,${DEMO_CURRENCY},2,180.00,100.00,1,80.00,1,80.00,1,0.00,${addDays(today, -1)}`);
      await expect(page.getByText('Cuentas por pagar exportadas.')).toBeVisible();
      writeFileSync(path.join(evidence, `payables-${viewport.width}.csv`), csvText);

      // El proveedor: sus gastos por vencimiento, con «Registrar pago».
      await row.click();
      const dialog = page.getByRole('dialog', { name: new RegExp(`· ${DEMO_CURRENCY}$`) });
      const items = dialog.getByTestId('supplier-expense');
      await expect(items).toHaveCount(2, { timeout: 15_000 });
      await expect(items.first()).toContainText(amount('100,00'));
      await expect(items.nth(1)).toContainText(amount('80,00'));
      if (narrow) await expectDialogInsideViewport(page, dialog);
      await auditBothSchemes(page, evidence, `payables-supplier-${viewport.width}`, dialog);

      await items.first().getByRole('button', { name: /^Registrar pago de Laboratorio/ }).click();
      const pay = page.getByRole('dialog', { name: 'Registrar pago' });
      await expect(pay.getByText(/Pendiente: (USD\s)?100,00/)).toBeVisible({ timeout: 15_000 });
      await pay.getByLabel('Medio de pago').selectOption({ label: 'Transferencia' });
      await pay.getByRole('button', { name: 'Registrar pago' }).click();
      await expect(pay).toBeHidden({ timeout: 15_000 });
      await expect(dialog.getByText(/Pago de .*100,00.* registrado\./)).toBeVisible();
      await expect(items).toHaveCount(1, { timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      // La fila se recarga: queda lo que vence en 3 días, nada vencido.
      await expect(rowBox).toContainText(amount('80,00'), { timeout: 15_000 });
      await expect(rowBox).not.toContainText(amount('180,00'));
      if (narrow) await expectNoHorizontalScroll(page);
    } finally {
      // La demo es compartida: lo que quede abierto se anula.
      for (const id of [overdue.id, soon.id]) {
        await page.request.post(`${API_URL}/expenses/${id}/void`, {
          headers: admin.headers,
          data: { reason: `Limpieza e2e DX-411 ${suffix}` },
        });
      }
    }
  });
}

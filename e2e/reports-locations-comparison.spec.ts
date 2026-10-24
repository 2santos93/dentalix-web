import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';

/**
 * e2e (DX-014): «Reportes» → «Comparar sedes» contra la clínica DEMO sembrada
 * (`npm run seed:demo` en la API), que tiene actividad en sus dos sedes en el
 * mes actual y en el anterior.
 *
 *  1. La administración entra por el menú lateral, ve la fila de cada sede
 *     sembrada y el «Total clínica» de «Este mes» frente al período anterior, con flechas de
 *     variación; ordena por una columna (aria-sort) y exporta el CSV con los
 *     filtros activos («Mes anterior», «Mismo período del año anterior»).
 *  2. A 390 px, la tarjeta de cada sede, sin scroll horizontal.
 *  3. Un odontólogo no ve la entrada y, si abre la URL, ve el aviso (403).
 *  4. axe sin violaciones serias en claro y oscuro, a 390 y 1440 px. Las
 *     capturas y los JSON de axe van a DX014_QA_DIR (o a test-results).
 *
 * DX-337: las sedes se buscan por su nombre, sin contar filas ni tarjetas.
 * La comparación también lista las sedes retiradas, y otra suite o una
 * prueba a mano sobre la misma base pueden haber añadido alguna: eso no
 * cambia lo que este spec comprueba de las dos sembradas.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';
const SEDES = ['Sede principal', 'Sede Norte'];

/** Fila (1440 px) o tarjeta (390 px) de la sede `name`, por su nombre exacto. */
function sedeRow(page: Page, name: string) {
  return page
    .getByTestId('comparison-row')
    .filter({ has: page.getByRole('rowheader', { name, exact: true }) });
}
function sedeCard(page: Page, name: string) {
  return page.getByTestId('comparison-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

const origin = tenantOrigin(DEMO_SUBDOMAIN);

async function openReports(page: Page): Promise<void> {
  await loginAs(page, origin, ADMIN_EMAIL, DEMO_PASSWORD);
  await page.getByRole('link', { name: 'Reportes' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(`${origin}/reportes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Comparar sedes', selected: true })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('ADMIN a 1440 px: una fila por sede y el total, con variaciones, orden y CSV', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReports(page);

  const table = page.getByRole('table', { name: 'Indicadores por sede y total de la clínica' });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Período')).toHaveValue('this_month');
  await expect(page.getByLabel('Comparar con')).toHaveValue('previous');

  const rows = page.getByTestId('comparison-row');
  for (const name of SEDES) {
    await expect(sedeRow(page, name)).toHaveCount(1);
    await expect(sedeRow(page, name)).toBeVisible();
  }
  const total = page.getByTestId('comparison-total');
  await expect(total.getByRole('rowheader', { name: 'Total clínica' })).toBeVisible();
  // La demo cobra en COP: un importe por moneda, con su código.
  await expect(total.getByRole('cell').first()).toContainText('COP');
  for (const column of [
    'Producción',
    'Cobrado',
    '% de cobro',
    'Citas atendidas',
    'No-show %',
    'Pacientes nuevos',
    'Ticket medio',
    'Ocupación %',
  ]) {
    await expect(table.getByRole('button', { name: column, exact: true })).toBeVisible();
    await expect(table.getByRole('button', { name: `Cómo se calcula: ${column}` })).toBeVisible();
  }
  // Con comparación hay variaciones (mejora/empeora/igual) con su flecha.
  await expect(table.locator('[data-trend] svg').first()).toBeVisible();

  // DX-305 (BE-045): la demo tiene un realizado «Sin atribuir» (Ricardo
  // Salcedo) y el mes anterior empieza antes de que esta base registrara la
  // sede de cada procedimiento: «Producción» y «% de cobro» no se comparan, y
  // la pantalla lo dice en una línea.
  await expect(page.getByRole('note')).toContainText('no se comparan donde dice «Sin comparar»');
  await expect(table.getByRole('columnheader', { name: /^Producción/ }).getByTestId('unattributed-mark')).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /^Cobrado/ }).getByTestId('unattributed-mark')).toHaveCount(0);
  await expect(page.getByTestId('comparison-total').getByTestId('not-compared').first()).toBeVisible();

  // «Cómo se calcula» al enfocar.
  await table.getByRole('button', { name: 'Cómo se calcula: Producción' }).focus();
  await expect(page.getByRole('tooltip').filter({ visible: true })).toContainText('precio neto');
  await page.keyboard.press('Escape');

  // Orden: por «Cobrado», de mayor a menor y luego al revés.
  const collected = table.getByRole('columnheader', { name: /^Cobrado/ });
  await expect(collected).toHaveAttribute('aria-sort', 'none');
  await table.getByRole('button', { name: 'Cobrado', exact: true }).click();
  await expect(collected).toHaveAttribute('aria-sort', 'descending');
  // Las dos sedes sembradas cambian de orden entre sí (puede haber otras).
  const sedeOrder = async () => {
    const names = (await rows.getByRole('rowheader').allTextContents()).map((n) => n.trim());
    return SEDES.filter((name) => names.includes(name)).sort((a, b) => names.indexOf(a) - names.indexOf(b));
  };
  const desc = await sedeOrder();
  expect(desc).toHaveLength(SEDES.length);
  await table.getByRole('button', { name: 'Cobrado', exact: true }).click();
  await expect(collected).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(sedeOrder).toEqual([...desc].reverse());
  await expect(page.getByTestId('comparison-total')).toBeVisible();

  // CSV con los filtros activos.
  await page.getByLabel('Período').selectOption('last_month');
  await page.getByLabel('Comparar con').selectOption('previous_year');
  await expect(page.getByText(/^Del 01\//)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^comparar-sedes-\d{4}-\d{2}-01-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv.startsWith('\uFEFFPeríodo,Comparado con,Sede,Indicador')).toBe(true);
  for (const name of [...SEDES, 'Total clínica']) expect(csv).toContain(`"${name}"`);
  const [, first] = csv.split('\r\n');
  const [period, compared] = first.split(',');
  const [from] = period.split(' a ');
  const [prevFrom] = compared.split(' a ');
  expect(Number(prevFrom.slice(0, 4))).toBe(Number(from.slice(0, 4)) - 1);
  await expect(page.getByText('Reporte exportado.')).toBeVisible();
});

test('ADMIN a 390 px: tarjetas por sede sin scroll horizontal', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openReports(page);
  for (const name of SEDES) {
    await expect(sedeCard(page, name)).toHaveCount(1, { timeout: 30_000 });
  }
  await expect(page.getByTestId('comparison-total-card')).toContainText('Total clínica');
  await expect(page.getByRole('table')).toBeHidden();
  await page.getByLabel('Ordenar por').selectOption('production');
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
});

test('DENTIST: sin entrada en el menú y aviso si abre la URL', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, DENTIST_EMAIL, DEMO_PASSWORD);
  await expect(page.getByRole('link', { name: 'Pacientes' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
  await page.goto(`${origin}/reportes`);
  await expect(page.getByText('Tu rol no tiene acceso a los reportes.')).toBeVisible({ timeout: 30_000 });
});

test('axe: /reportes a 390 y 1440 px, en claro y oscuro', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const evidence = process.env.DX014_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReports(page);
  for (const name of SEDES) {
    await expect(sedeRow(page, name)).toHaveCount(1, { timeout: 30_000 });
  }

  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function serious(surface: string) {
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<AxeResults> } }).axe;
      return axe.run();
    });
    writeFileSync(path.join(evidence, `axe-${surface}.json`), JSON.stringify(results.violations, null, 2));
    await page.screenshot({ path: path.join(evidence, `${surface}.png`), fullPage: true });
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
  }

  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
      const shown = width < 768 ? page.getByTestId('comparison-card') : page.getByTestId('comparison-row');
      await expect(shown.first()).toBeVisible();
      expect.soft(await serious(`reportes-${width}-${colorScheme}`), `/reportes ${width} ${colorScheme}`).toEqual([]);
    }
  }
});

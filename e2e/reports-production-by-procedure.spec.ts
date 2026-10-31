import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';
import { fillDate } from './support/dates';
import { openSection } from './support/nav';

/**
 * e2e (DX-423): «Reportes» → «Producción por procedimiento» contra la clínica
 * DEMO sembrada (`npm run seed:demo` en la API), que tiene procedimientos
 * realizados en sus dos sedes este mes y el anterior (Resina y Profilaxis) y
 * un realizado «Sin atribuir».
 *
 *  1. ADMIN a 1440 px: la pestaña nueva junto a «Comparar sedes», filas por
 *     categoría y código, subtotal y total por moneda, «Sin atribuir» con su
 *     aviso; clic en una fila → sus procedimientos con el paciente; CSV con
 *     las mismas filas, período y filtros en la cabecera y sin pacientes.
 *  2. A 390 px: sigue siendo tabla, se desplaza de lado dentro de su marco
 *     (la página no) y la cabecera queda fija al bajar.
 *  3. DENTIST: solo su producción, sin filtro de profesional.
 *  4. axe sin violaciones serias en claro y oscuro, a 390 y 1440 px. Capturas
 *     y JSON a DX423_QA_DIR (o a test-results).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';
const TABLE = 'Producción por procedimiento y categoría';

const origin = tenantOrigin(DEMO_SUBDOMAIN);

async function openProduction(page: Page, email = ADMIN_EMAIL): Promise<void> {
  await loginAs(page, origin, email, DEMO_PASSWORD);
  await openSection(page, 'Reportes');
  await expect(page).toHaveURL(new RegExp(`${origin}/reportes`));
  // ADMIN tiene dos informes (pestañas); el odontólogo solo este, sin barra de pestañas.
  await expect(page.getByLabel('Período')).toBeVisible({ timeout: 30_000 });
  const tab = page.getByRole('tab', { name: 'Producción por procedimiento' });
  if ((await tab.count()) > 0 && (await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(page).toHaveURL(new RegExp(`/reportes(\\?tab=produccion)?$`));
  // «Este año»: la demo tiene producción en los dos últimos meses.
  await page.getByLabel('Período').selectOption('this_year');
  await expect(page.getByRole('table', { name: TABLE })).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial' });

test('ADMIN a 1440 px: filas por categoría y código, totales por moneda, detalle y CSV', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProduction(page);
  await expect(page.getByRole('tab', { name: 'Comparar sedes' })).toBeVisible();

  const table = page.getByRole('table', { name: TABLE });
  for (const column of ['Procedimiento', 'Cantidad', 'Bruto', 'Descuentos', 'Neto', 'Honorario medio', 'Medio de catálogo', 'Diferencia']) {
    await expect(table.getByRole('columnheader', { name: new RegExp(`^${column}`) })).toBeVisible();
  }
  const rows = page.getByTestId('production-row');
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId('production-subtotal').first()).toBeVisible();
  // La demo factura en USD: un total por moneda, nunca mezclado (otros specs
  // dejan en ella planes en COP, que salen en su propio total).
  const totals = page.getByTestId('production-total');
  await expect(totals.filter({ hasText: 'USD' })).toHaveCount(1);
  await expect(totals.filter({ hasText: 'USD' })).not.toContainText('COP');
  // DX-305: el «Sin atribuir» de la demo no tiene fecha: aviso bajo la tabla,
  // no una fila.
  await expect(page.getByTestId('production-undated')).toContainText('sin fecha («Sin atribuir»');

  // «Cómo se calcula» de la diferencia frente al catálogo.
  await table.getByRole('button', { name: 'Cómo se calcula: Diferencia' }).focus();
  await expect(page.getByRole('tooltip').filter({ visible: true })).toContainText('catálogo');
  await page.keyboard.press('Escape');

  // Clic en la fila → sus procedimientos con el paciente (solo aquí hay nombres).
  await rows.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const patient = dialog.getByRole('link').first();
  await expect(patient).toBeVisible({ timeout: 30_000 });
  const patientName = (await patient.textContent())?.trim() ?? '';
  expect(patientName).not.toBe('');
  await expect(dialog.getByTestId('production-item').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // CSV: las mismas filas y totales, con período y filtros, sin pacientes.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^produccion-por-procedimiento-\d{4}-01-01-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, 'utf8');
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
  expect(lines[0]).toBe('"Producción por procedimiento"');
  expect(lines[1]).toMatch(/^"Período","\d{4}-01-01 a \d{4}-\d{2}-\d{2}"$/);
  expect(lines[2]).toBe('"Sede","Todas tus sedes"');
  expect(lines[3]).toBe('"Profesional","Todo el equipo"');
  const kind = (k: string) => lines.filter((l) => l.startsWith(`"${k}"`)).length;
  expect(kind('Procedimiento')).toBe(await rows.count());
  expect(kind('Subtotal')).toBe(await page.getByTestId('production-subtotal').count());
  expect(kind('Total')).toBe(await totals.count());
  expect(kind('Sin atribuir')).toBe(await page.getByTestId('production-unattributed').count());
  expect(kind('Sin fecha (fuera del período)')).toBeGreaterThan(0);
  expect(csv).not.toContain(patientName);
  await expect(page.getByText('Reporte exportado.')).toBeVisible();

  // Filtro de sede: va a la API y la tabla responde.
  await page.getByLabel('Sede de realización').selectOption({ label: 'Sede Norte' });
  await expect(page.getByRole('table', { name: TABLE })).toBeVisible({ timeout: 30_000 });
});

test('ADMIN a 390 px: tabla con scroll horizontal en su marco y cabecera fija', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 700 });
  await openProduction(page);
  const region = page.getByRole('region', { name: TABLE });
  await expect(region).toBeVisible();
  const frame = await region.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(frame.scrollWidth).toBeGreaterThan(frame.clientWidth);
  await expectNoHorizontalScroll(page);

  // Cabecera fija: al desplazar el marco hacia abajo y a un lado, la fila de
  // cabecera sigue arriba y la primera columna a la izquierda.
  const header = region.getByRole('columnheader', { name: 'Procedimiento' });
  const before = await header.boundingBox();
  await region.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  });
  const after = await header.boundingBox();
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
  // La subcabecera de cada categoría también queda fija a la izquierda: su
  // nombre no se va con el scroll lateral (arriba del todo, a la derecha).
  await region.evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    el.scrollTop = 0;
    el.scrollLeft = el.scrollWidth;
  });
  const frameBox = await region.boundingBox();
  const category = region.locator('th[scope="colgroup"]').first();
  const categoryBox = await category.boundingBox();
  expect(categoryBox?.x ?? -1).toBeGreaterThanOrEqual((frameBox?.x ?? 0) - 1);
  expect((categoryBox?.x ?? 0) + (categoryBox?.width ?? 0)).toBeLessThanOrEqual((frameBox?.x ?? 0) + (frameBox?.width ?? 0));
  await expect(category).toBeVisible();
  // Dentro de los 390 px de la pantalla (antes quedaba en x = −387).
  expect(categoryBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((categoryBox?.x ?? 0) + (categoryBox?.width ?? 0)).toBeLessThanOrEqual(390);
  // Con el teclado: el marco es una parada de tabulador con nombre.
  await expect(region).toHaveAttribute('tabindex', '0');
});

test('ADMIN: un período sin realizados (enero de 2020) muestra el estado vacío, con el aviso de «sin fecha»', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProduction(page);
  await page.getByLabel('Período').selectOption('custom');
  await fillDate(page, 'Desde', '2020-01-01');
  await fillDate(page, 'Hasta', '2020-01-31');
  await expect(page.getByText('No hay procedimientos realizados en este período')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table', { name: TABLE })).toHaveCount(0);
  await expect(page.getByTestId('production-undated')).toBeVisible();
});

test('DENTIST: solo su producción, sin filtro de profesional', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProduction(page, DENTIST_EMAIL);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText('Solo tu producción', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Profesional')).toHaveCount(0);
});

test('axe: producción por procedimiento a 390 y 1440 px, en claro y oscuro', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const evidence = process.env.DX423_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProduction(page);

  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function serious(surface: string) {
    await page.mouse.move(0, 0);
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
      await expect(page.getByTestId('production-row').first()).toBeVisible();
      expect.soft(await serious(`produccion-${width}-${colorScheme}`), `produccion ${width} ${colorScheme}`).toEqual([]);
    }
  }
  // El detalle (diálogo) también.
  await page.getByTestId('production-row').first().click();
  await expect(page.getByRole('dialog').getByTestId('production-item').first()).toBeVisible({ timeout: 30_000 });
  expect.soft(await serious('produccion-detalle'), 'detalle').toEqual([]);
});

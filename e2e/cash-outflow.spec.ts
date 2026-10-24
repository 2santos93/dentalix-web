import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AxeResults } from 'axe-core';
import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { apiLogin, apiPost, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-274): salidas de caja menor desde el turno de recepción.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - recepción abre su caja con un fondo y, desde la tarjeta de su caja,
 *     registra una «Salida de caja» en el modal: la tarjeta cuenta las
 *     salidas del turno y el esperado en efectivo baja;
 *   - dos salidas más por la API y la administradora anula una (con la caja
 *     abierta deja de restar);
 *   - recepción cierra cuadrando y el informe de cierre imprimible tiene la
 *     columna «Salidas», la sección «Salidas de caja» con la anulada tachada,
 *     y a 1440 px el PDF sale en UNA hoja A4 con tres salidas;
 *   - con arqueo ciego la tarjeta cuenta las salidas sin enseñar lo esperado.
 * A 1440 y 390 px (sin scroll horizontal), con axe y capturas en claro y
 * oscuro (DX274_QA_DIR o test-results).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';

const origin = tenantOrigin(DEMO_SUBDOMAIN);
const FLOAT = 200_000;

const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

interface CurrentSession {
  session: { id: string; expected: { currency: string; method: string; expected: number }[] | null } | null;
}

async function currentSession(request: APIRequestContext, session: ApiSession): Promise<CurrentSession['session']> {
  const res = await request.get(`${API_URL}/cash-sessions/current`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as CurrentSession).session;
}

/** Cierra, si la hay, la caja abierta de quien trae `session` (cuadrada, sin arqueo ciego). */
async function closeOwnSession(request: APIRequestContext, session: ApiSession): Promise<void> {
  const open = await currentSession(request, session);
  if (!open) return;
  await apiPost(request, session, `/cash-sessions/${open.id}/close`, {
    counts: (open.expected ?? []).map((l) => ({ currency: l.currency, method: l.method, counted: Math.max(0, l.expected) })),
    differenceReason: 'Cierre de limpieza de la prueba e2e',
  });
}

async function setBlindClose(request: APIRequestContext, admin: ApiSession, blindClose: boolean): Promise<void> {
  const res = await request.put(`${API_URL}/cash-sessions/settings`, {
    headers: admin.headers,
    data: { requireOpenSession: false, blindClose },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

/** Ajustes por defecto y la caja de recepción cerrada. */
async function startClean(request: APIRequestContext) {
  const admin = await apiLogin(request, origin, ADMIN_EMAIL, DEMO_PASSWORD);
  const reception = await apiLogin(request, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
  await setBlindClose(request, admin, false);
  await closeOwnSession(request, reception);
  return { admin, reception };
}

function outflowViaApi(request: APIRequestContext, reception: ApiSession, category: string, amount: number) {
  return request
    .post(`${API_URL}/cash-sessions/current/outflows`, {
      headers: { ...reception.headers, 'Idempotency-Key': randomUUID() },
      data: { category, amount, currency: 'COP' },
    })
    .then(async (res) => {
      expect(res.ok(), `salida por la API falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as { id: string };
    });
}

/** Pestaña «Turnos» de la Caja con la caja de recepción ya abierta (por la API). */
async function openShifts(page: Page): Promise<void> {
  await loginAs(page, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
  await page.goto(`${origin}/caja?tab=turnos`);
  await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible({ timeout: 15_000 });
}

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * axe (violaciones serias o críticas) sobre lo que esta tarea pinta (`scope`:
 * el modal o la tarjeta de la caja) y captura de la página entera. El ratón
 * sale de encima de los botones: un `hover` a medio color no es el reposo.
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
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
}

/** Nº de hojas de un PDF (cuenta los objetos /Type /Page, no /Pages). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción registra salidas de caja y salen en el informe de cierre (${viewport.name})`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(180_000);
    const evidence = process.env.DX274_QA_DIR ?? testInfo.outputPath('qa');
    mkdirSync(evidence, { recursive: true });
    const narrow = viewport.width === 390;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const { admin, reception } = await startClean(page.request);
    await context.addInitScript(() => {
      window.print = () => undefined;
    });

    try {
      await apiPost(page.request, reception, '/cash-sessions/open', { floats: [{ currency: 'COP', amount: FLOAT }] });
      await openShifts(page);
      await expect(page.getByText('Salidas del turno: 0')).toBeVisible();
      if (narrow) await expectNoHorizontalScroll(page);

      // La salida desde el modal: sin categoría ni importe no deja.
      await page.getByRole('button', { name: 'Salida de caja' }).click();
      const dialog = page.getByRole('dialog', { name: 'Salida de caja' });
      if (narrow) await expectDialogInsideViewport(page, dialog);
      await expect(dialog.getByRole('option', { name: 'Mensajería' })).toBeAttached({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Registrar salida' }).click();
      await expect(dialog.getByText('Elige una categoría.')).toBeVisible();
      await dialog.getByLabel('Categoría').selectOption('Mensajería');
      await dialog.getByLabel('Proveedor').fill('Mensajeros Ya');
      await dialog.getByLabel('Descripción').fill('Envío de modelos al laboratorio');
      await dialog.getByLabel('Importe').fill('8000');
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
        expect.soft(await audit(page, evidence, `dialog-${viewport.width}-${colorScheme}`, dialog)).toEqual([]);
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await dialog.getByRole('button', { name: 'Registrar salida' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(/Salida de caja de 8\.?000,00\sCOP registrada\./)).toBeVisible();
      await expect(page.getByText('Salidas del turno: 1')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(figure(FLOAT - 8_000)).first()).toBeVisible();

      // Dos más por la API; la administradora anula una con la caja abierta.
      await outflowViaApi(page.request, reception, 'Aseo y cafetería', 22_000);
      await outflowViaApi(page.request, reception, 'Papelería', 25_000);
      const taxi = await outflowViaApi(page.request, reception, 'Otros', 12_000);
      await apiPost(page.request, admin, `/expenses/${taxi.id}/void`, { reason: 'Registrada dos veces' });
      const expected = FLOAT - 8_000 - 22_000 - 25_000;
      await page.reload();
      await expect(page.getByText('Salidas del turno: 3')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(figure(expected)).first()).toBeVisible();
      if (narrow) await expectNoHorizontalScroll(page);
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
        expect.soft(await audit(page, evidence, `card-${viewport.width}-${colorScheme}`, page.getByRole('region', { name: /^Mi caja en / }))).toEqual([]);
      }
      await page.emulateMedia({ colorScheme: 'light' });

      // Cierra cuadrando: lo esperado ya resta las salidas.
      await page.getByRole('button', { name: 'Cerrar caja' }).click();
      const close = page.getByRole('dialog', { name: 'Cerrar caja' });
      await close.getByLabel('Contado en efectivo (COP)').fill(String(expected));
      await expect(close.getByTestId('row-difference')).toContainText('Cuadra');
      await close.getByRole('button', { name: 'Cerrar caja' }).click();
      await expect(page.getByText('Caja cerrada: el arqueo quedó guardado.')).toBeVisible({ timeout: 15_000 });

      // El informe imprimible: columna «Salidas», sección y la anulada aparte.
      const row = page.getByRole('table', { name: 'Turnos de caja' }).getByRole('row').filter({ hasText: 'Cerrada' }).first();
      const [report] = await Promise.all([
        context.waitForEvent('page'),
        row.getByRole('link', { name: /Informe de cierre/ }).click(),
      ]);
      await report.setViewportSize({ width: viewport.width, height: viewport.height });
      const printed = report.getByTestId('cash-session-report');
      await expect(printed).toContainText('Informe de cierre de caja', { timeout: 15_000 });
      await expect(printed.getByRole('columnheader', { name: 'Salidas' })).toBeAttached();
      await expect(printed).toContainText(figure(-55_000));
      const outflows = printed.getByRole('table', { name: 'Salidas de caja' });
      await expect(outflows).toContainText('Mensajería');
      await expect(outflows).toContainText('Mensajeros Ya');
      await expect(outflows).toContainText('Papelería');
      await expect(printed.getByRole('heading', { name: 'Salidas anuladas' })).toBeVisible();
      await expect(printed.getByRole('list', { name: 'Salidas anuladas' })).toContainText('Registrada dos veces');
      if (narrow) await expectNoHorizontalScroll(report);
      await report.emulateMedia({ media: 'print' });
      await expect(printed).toBeVisible();
      await report.screenshot({ path: path.join(evidence, `report-print-${viewport.width}.png`), fullPage: true });
      if (!narrow) {
        const pdf = await report.pdf({ preferCSSPageSize: true, path: path.join(evidence, 'report-a4.pdf') });
        expect(pdfPageCount(pdf)).toBe(1);
      }
      await report.close();
    } finally {
      await closeOwnSession(page.request, reception);
    }
  });
}

test('arqueo ciego: la tarjeta cuenta las salidas sin enseñar lo esperado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { admin, reception } = await startClean(page.request);
  try {
    await setBlindClose(page.request, admin, true);
    await apiPost(page.request, reception, '/cash-sessions/open', { floats: [{ currency: 'COP', amount: FLOAT }] });
    await outflowViaApi(page.request, reception, 'Mensajería', 9_000);
    await openShifts(page);
    await expect(page.getByText('Salidas del turno: 1')).toBeVisible();
    await expect(page.getByText(/Arqueo ciego/)).toBeVisible();
    await expect(page.getByText('Esperado hasta ahora')).toHaveCount(0);
    await expect(page.getByText(figure(FLOAT - 9_000))).toHaveCount(0);
  } finally {
    await setBlindClose(page.request, admin, false);
    await closeOwnSession(page.request, reception);
  }
});

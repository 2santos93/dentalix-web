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
 *   - con arqueo ciego la tarjeta cuenta las salidas sin enseñar lo esperado;
 *   - la administradora registra en «Gastos» un gasto ya pagado «Desde mi caja
 *     abierta»: su esperado en efectivo baja en ese importe y el pago enlaza
 *     con su caja;
 *   - la administradora anula en «Gastos» una salida de una caja de recepción
 *     ya cerrada: el arqueo de esa caja no cambia (la salida sigue restando y
 *     sale como anulada «con la caja ya cerrada») y la devolución es un ajuste
 *     «Anulación de salida» en la caja abierta de la administradora.
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

interface ExpectedLine {
  currency: string;
  method: string;
  expected: number;
  outflows?: number;
  outflowsCount?: number;
}

interface SessionAdjustment {
  kind: string;
  amount: number;
  reason: string | null;
}

interface CurrentSession {
  session: { id: string; expected: ExpectedLine[] | null; adjustments: SessionAdjustment[] } | null;
}

interface SessionDetail {
  id: string;
  status: string;
  expected: ExpectedLine[];
  closing: unknown;
  voidedOutflows: { id: string; voidReason: string | null; bookedAsAdjustment: boolean }[];
  laterAdjustments: SessionAdjustment[];
}

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

function cashLine(lines: ExpectedLine[] | null | undefined): ExpectedLine | undefined {
  return (lines ?? []).find((l) => l.currency === 'COP' && l.method === 'CASH');
}

async function sessionDetail(request: APIRequestContext, session: ApiSession, id: string): Promise<SessionDetail> {
  const res = await request.get(`${API_URL}/cash-sessions/${id}`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as SessionDetail;
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

function outflowViaApi(
  request: APIRequestContext,
  reception: ApiSession,
  category: string,
  amount: number,
  supplier?: string,
) {
  return request
    .post(`${API_URL}/cash-sessions/current/outflows`, {
      headers: { ...reception.headers, 'Idempotency-Key': randomUUID() },
      data: { category, amount, currency: 'COP', ...(supplier ? { supplier } : {}) },
    })
    .then(async (res) => {
      expect(res.ok(), `salida por la API falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as { id: string };
    });
}

/** «Gastos» como administradora, con la lista del mes ya cargada. */
async function openExpenses(page: Page): Promise<void> {
  await loginAs(page, origin, ADMIN_EMAIL, DEMO_PASSWORD);
  await page.goto(`${origin}/caja/gastos`);
  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^\d+ gastos?$/)).toBeVisible({ timeout: 15_000 });
}

/** La lista visible de «Gastos»: la tabla en escritorio, las tarjetas en móvil. */
function expensesListing(page: Page, narrow: boolean): Locator {
  return narrow ? page.getByRole('list', { name: 'Gastos' }) : page.getByRole('table', { name: /^Gastos del periodo/ });
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

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`ADMIN paga un gasto «Desde mi caja abierta» y su esperado baja (${viewport.name})`, async ({ page }) => {
    test.setTimeout(120_000);
    const narrow = viewport.width === 390;
    const supplier = `Mensajeros Express ${suffix}${viewport.width}`;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const { admin } = await startClean(page.request);
    await closeOwnSession(page.request, admin);

    try {
      await apiPost(page.request, admin, '/cash-sessions/open', { floats: [{ currency: 'COP', amount: 100_000 }] });
      await openExpenses(page);

      await page.getByRole('button', { name: 'Nuevo gasto' }).click();
      const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
      await expect(form.getByRole('option', { name: 'Mensajería' })).toBeAttached({ timeout: 15_000 });
      await form.getByLabel('Categoría').selectOption('Mensajería');
      await form.getByLabel('Proveedor').fill(supplier);
      await form.getByLabel('Importe').fill('30000');
      await form.getByLabel('Ya está pagado').check();
      await expect(form.getByLabel('Medio de pago')).toHaveValue('CASH');
      await form.getByLabel('Desde mi caja abierta').check();
      // Desde la caja el pago es de hoy: la fecha no se edita.
      await expect(form.getByLabel('Fecha del pago')).toBeDisabled();
      if (narrow) await expectDialogInsideViewport(page, form);
      await form.getByRole('button', { name: 'Registrar gasto' }).click();
      await expect(form).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText('Gasto registrado.')).toBeVisible();

      await page.getByLabel('Buscar por proveedor o descripción').fill(supplier);
      await expect(page.getByText('1 gasto', { exact: true })).toBeVisible({ timeout: 15_000 });
      const listing = expensesListing(page, narrow);
      await expect(listing).toContainText(supplier, { timeout: 15_000 });
      await expect(listing).toContainText('Pagado');

      // El pago enlaza con la caja de la que salió.
      await listing.getByRole('button', { name: /^Ver el gasto de Mensajería del / }).click();
      const detail = page.getByRole('dialog', { name: `Mensajería · ${supplier}` });
      const mine = await currentSession(page.request, admin);
      await expect(detail.getByRole('link', { name: /Salida de caja/ })).toHaveAttribute(
        'href',
        `/caja/turnos/${mine!.id}`,
        { timeout: 15_000 },
      );
      await page.keyboard.press('Escape');

      // El esperado en efectivo de su caja baja en el importe.
      const line = cashLine(mine!.expected);
      expect(line?.expected).toBe(70_000);
      expect(line?.outflowsCount).toBe(1);
      await page.goto(`${origin}/caja?tab=turnos`);
      const card = page.getByRole('region', { name: /^Mi caja en / });
      await expect(card.getByText('Salidas del turno: 1')).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(figure(70_000)).first()).toBeVisible();
      if (narrow) await expectNoHorizontalScroll(page);
    } finally {
      await closeOwnSession(page.request, admin);
    }
  });
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`ADMIN anula una salida de una caja cerrada: el cierre no cambia y el ajuste va a su caja (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const evidence = process.env.DX274_QA_DIR ?? testInfo.outputPath('qa');
    mkdirSync(evidence, { recursive: true });
    const narrow = viewport.width === 390;
    const tag = `${suffix}${viewport.width}`;
    const supplier = `Papelería del Centro ${tag}`;
    const reason = `Se devolvió el dinero ${tag}`;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const { admin, reception } = await startClean(page.request);
    await closeOwnSession(page.request, admin);

    try {
      // Recepción: un turno con una salida de 15.000, cerrado cuadrando.
      const shift = await apiPost<{ id: string }>(page.request, reception, '/cash-sessions/open', {
        floats: [{ currency: 'COP', amount: FLOAT }],
      });
      await outflowViaApi(page.request, reception, 'Papelería', 15_000, supplier);
      await apiPost(page.request, reception, `/cash-sessions/${shift.id}/close`, {
        counts: [{ currency: 'COP', method: 'CASH', counted: FLOAT - 15_000 }],
      });
      const before = await sessionDetail(page.request, admin, shift.id);
      expect(before.status).toBe('CLOSED');
      expect(cashLine(before.expected)?.expected).toBe(FLOAT - 15_000);

      // La caja de la administradora, donde cuenta la devolución.
      const own = await apiPost<{ id: string }>(page.request, admin, '/cash-sessions/open', { floats: [] });

      // Anula la salida (su gasto) desde «Gastos».
      await openExpenses(page);
      await page.getByLabel('Buscar por proveedor o descripción').fill(supplier);
      await expect(page.getByText('1 gasto', { exact: true })).toBeVisible({ timeout: 15_000 });
      const listing = expensesListing(page, narrow);
      await expect(listing).toContainText(supplier, { timeout: 15_000 });
      await listing.getByRole('button', { name: /^Ver el gasto de Papelería del / }).click();
      const detail = page.getByRole('dialog', { name: `Papelería · ${supplier}` });
      await expect(detail.getByRole('link', { name: /Salida de caja/ })).toHaveAttribute('href', `/caja/turnos/${shift.id}`, {
        timeout: 15_000,
      });
      await detail.getByRole('button', { name: 'Anular gasto' }).click();
      const confirm = page.getByRole('dialog', { name: '¿Anular este gasto?' });
      await expect(confirm).toContainText('Las salidas de una caja ya cerrada se devuelven como ajuste en tu caja abierta');
      await confirm.getByLabel('Motivo de la anulación').fill(reason);
      await confirm.getByRole('button', { name: 'Anular gasto' }).click();
      await expect(confirm).toBeHidden({ timeout: 15_000 });
      await expect(detail.getByText('Gasto anulado.')).toBeVisible();
      await page.keyboard.press('Escape');

      // El cierre de recepción no cambia: misma línea esperada y mismo cierre.
      const after = await sessionDetail(page.request, admin, shift.id);
      expect(after.expected).toEqual(before.expected);
      expect(after.closing).toEqual(before.closing);
      expect(after.voidedOutflows).toEqual([
        expect.objectContaining({ voidReason: reason, bookedAsAdjustment: true }),
      ]);
      expect(after.laterAdjustments).toEqual([
        expect.objectContaining({ kind: 'OUTFLOW_VOID', amount: 15_000, reason }),
      ]);

      // La devolución cuenta en la caja abierta de la administradora.
      const mine = await currentSession(page.request, admin);
      expect(mine?.id).toBe(own.id);
      expect(mine?.adjustments).toEqual([expect.objectContaining({ kind: 'OUTFLOW_VOID', amount: 15_000, reason })]);
      expect(cashLine(mine?.expected)?.expected).toBe(15_000);

      // El informe del turno cerrado lo dice sin tocar su arqueo.
      await page.goto(`${origin}/caja/turnos/${shift.id}`);
      const report = page.getByTestId('cash-session-report');
      await expect(report).toContainText('Informe de cierre de caja', { timeout: 15_000 });
      await expect(report.getByRole('list', { name: 'Salidas anuladas' })).toContainText(reason);
      await expect(report).toContainText('Anulada con la caja ya cerrada: aquí sigue restando');
      await expect(report).toContainText('Ajustes posteriores a este cierre');
      await expect(report).toContainText('Anulación de salida');
      await expect(report).toContainText(figure(FLOAT - 15_000));
      if (narrow) await expectNoHorizontalScroll(page);
      // axe sobre lo que pinta DX-274 (las salidas anuladas): el enlace «Otra
      // caja de la sede» de los ajustes posteriores (DX-252) ya tenía poco
      // contraste en oscuro.
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
        const voided = report.getByRole('list', { name: 'Salidas anuladas' });
        expect
          .soft(await audit(page, evidence, `closed-void-report-${viewport.width}-${colorScheme}`, voided))
          .toEqual([]);
      }
      await page.emulateMedia({ colorScheme: 'light' });

      // Y en la caja de la administradora, como ajuste de este turno.
      await page.goto(`${origin}/caja/turnos/${own.id}`);
      const ownReport = page.getByTestId('cash-session-report');
      await expect(ownReport).toContainText('Ajustes en este turno', { timeout: 15_000 });
      await expect(ownReport).toContainText('Anulación de salida');
      await expect(ownReport).toContainText(reason);
    } finally {
      await closeOwnSession(page.request, admin);
      await closeOwnSession(page.request, reception);
    }
  });
}

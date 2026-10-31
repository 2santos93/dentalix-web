import { test, expect, type Browser, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { accessTokenOf, loginAs, registerAndLogin } from './support/auth';
import { addStaffViaApi, apiPost, type ApiSession } from './support/api';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';
import { E2E_BROWSER_LOCALE, E2E_REGION } from './support/regional';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-051): imputación de abonos a los ítems del plan.
 *
 * Registra una clínica (su dueño es ADMIN) y siembra por la API real un
 * paciente con un plan en USD: un ítem REALIZADO de 100, uno ACEPTADO de 50 y
 * uno PROPUESTO de 70, más un abono de 180. Desde la pestaña del plan:
 *   - «Cobrado» por ítem es 100 / 50 / — y el plan tiene 30 «Sin imputar»;
 *   - al pasar el propuesto a «Aceptado», el sobrante se le imputa (Pendiente
 *     40) y «Sin imputar» desaparece;
 *   - «Imputación» → «Fijar a mano» mueve 20 del realizado al nuevo aceptado;
 *     las columnas cambian y el abono queda «Fijada a mano»;
 *   - «Reparto automático» lo devuelve al reparto de antes;
 *   - recepción (invitada por la API) abre «Estado de cuenta» → «Ver por ítem»
 *     y ve los procedimientos y lo cobrado, sin ninguna acción de imputar;
 *   - anular el abono deja «Cobrado» a 0 en todos los ítems.
 * Se ejecuta en escritorio (1440px) y en móvil (390px). Un último test pasa
 * axe por la tabla del plan, el «Ver por ítem» y el modal a 390 y 1440 px, en
 * claro y oscuro.
 *
 * Requiere los dos servidores y el buzón de e2e (ver `scripts/e2e-ci.sh`).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';

// Mismo formateador que la app (`formatCurrency`, locale `es`, dos decimales).
const usd = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const money = (amount: number) => usd.format(amount);
/** DX-386: «Cobrado»/«Pendiente» por ítem con el formato de la sede y el código ISO («USD 100,00»). */
const sedeUsd = (amount: number) => moneyWithCode(amount, 'USD', regionalFormat(E2E_REGION));

interface Seeded {
  patientId: string;
  planId: string;
  paymentId: string;
  done: string;
  accepted: string;
  proposed: string;
  itemIds: Record<'done' | 'accepted' | 'proposed', string>;
  admin: ApiSession;
}

async function seed(page: Page, origin: string, tag: string): Promise<Seeded> {
  const host = new URL(origin).host;
  const admin: ApiSession = {
    origin,
    headers: { Authorization: `Bearer ${await accessTokenOf(page)}`, 'X-Tenant-Host': host },
  };
  const request = page.request;
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Irene',
    lastName: `Imputa${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `IM${tag}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const names = { done: `Corona${tag}`, accepted: `Resina${tag}`, proposed: `Endodoncia${tag}` };
  const items: Array<[keyof typeof names, string, number, 'DONE' | 'ACCEPTED' | null]> = [
    ['done', '11', 100, 'DONE'],
    ['accepted', '12', 50, 'ACCEPTED'],
    ['proposed', '13', 70, null],
  ];
  const itemIds = {} as Seeded['itemIds'];
  for (const [key, tooth, price, status] of items) {
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `im-${key}-${tag}`.slice(0, 40),
      kind: 'PROCEDURE',
      labelEs: names[key],
      color: '#3366CC',
      defaultPrice: price,
    });
    const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: tooth,
      catalogItemId: catalog.id,
    });
    itemIds[key] = item.id;
    if (status) {
      const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
        headers: admin.headers,
        data: { status },
      });
      expect(res.ok(), `pasar el ítem a ${status} falló: ${await res.text()}`).toBeTruthy();
    }
  }
  const payment = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/payments`, {
    amount: 180,
    currency: 'USD',
    paidAt: new Date().toISOString(),
    method: 'CASH',
  });
  return { patientId: patient.id, planId: plan.id, paymentId: payment.id, ...names, itemIds, admin };
}

type Expected = { paid: number; pending: number } | 'not-billable';

/** «Cobrado» y «Pendiente» de un ítem: celdas en escritorio, línea en la tarjeta móvil. */
async function expectItem(panel: Locator, mobile: boolean, procedure: string, expected: Expected) {
  if (!mobile) {
    const row = panel
      .getByRole('table', { name: /^Ítems de la visita \d+$/ })
      .getByRole('row')
      .filter({ hasText: procedure });
    const paid = row.locator('td[data-label="Cobrado"]');
    const pending = row.locator('td[data-label="Pendiente"]');
    if (expected === 'not-billable') {
      await expect(paid.getByRole('img', { name: 'Sin importe a cobrar' })).toBeVisible();
      await expect(pending.getByRole('img', { name: 'Sin importe a cobrar' })).toBeVisible();
      return;
    }
    await expect(paid).toHaveText(sedeUsd(expected.paid));
    await expect(pending).toHaveText(expected.pending === 0 ? 'Cubierto' : sedeUsd(expected.pending));
    return;
  }
  const card = panel.locator('li').filter({ hasText: procedure }).locator('visible=true');
  if (expected === 'not-billable') {
    await expect(card.getByRole('img', { name: 'Sin importe a cobrar' })).toBeVisible();
    return;
  }
  if (expected.pending === 0) {
    await expect(card).toContainText(`Cobrado ${sedeUsd(expected.paid)} ·`);
    await expect(card.getByText('Cubierto', { exact: true })).toBeVisible();
  } else {
    await expect(card).toContainText(`Cobrado ${sedeUsd(expected.paid)} · Pendiente ${sedeUsd(expected.pending)}`);
  }
}

/** La cifra «Sin imputar» del resumen del plan (o su ausencia). */
function unallocatedFigure(panel: Locator): Locator {
  return panel.locator('dl > div').filter({ has: panel.page().locator('dt', { hasText: /^Sin imputar$/ }) });
}

async function openPlan(page: Page, origin: string, patientId: string): Promise<Locator> {
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
  return panel;
}

async function openPayments(panel: Locator) {
  const fold = panel.getByRole('button', { name: /^Abonos y saldo\s+\d+ abonos?$/ });
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
}

async function openAllocation(page: Page, panel: Locator): Promise<Locator> {
  await panel.getByRole('button', { name: 'Imputación' }).locator('visible=true').first().click();
  const dialog = page.getByRole('dialog', { name: 'Imputar abono' });
  await expect(dialog.getByText(`Disponible para imputar: ${money(180)}`)).toBeVisible({ timeout: 15_000 });
  return dialog;
}

async function receptionSees(browser: Browser, origin: string, viewport: { width: number; height: number }, data: Seeded, email: string) {
  const context = await browser.newContext({ viewport, locale: E2E_BROWSER_LOCALE, timezoneId: 'America/Bogota' });
  const page = await context.newPage();
  try {
    await loginAs(page, origin, email, password);
    await page.goto(`${origin}/patients/${data.patientId}?tab=account-statement`);
    const statement = page.locator('#tabpanel-account-statement');
    const toggle = statement.getByRole('button', { name: /^Ver por ítem/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = statement.locator('table[aria-label="Cobrado por ítem del plan"]');
    await expect(detail).toBeVisible({ timeout: 15_000 });
    for (const [procedure, paid] of [
      [data.done, 100],
      [data.accepted, 50],
      [data.proposed, 30],
    ] as const) {
      const row = detail.locator('tr').filter({ hasText: procedure });
      await expect(row.locator('td[data-label="Cobrado"]')).toHaveText(sedeUsd(paid));
    }
    // Solo lectura: recepción no imputa ni ve el plan clínico.
    await expect(page.getByRole('button', { name: 'Imputación' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Plan de tratamiento' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  } finally {
    await context.close();
  }
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`DX-051: el abono se imputa a los ítems, se fija a mano, vuelve al automático y recepción lo ve por ítem (${viewport.name})`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const mobile = viewport.width < 768;
    const tag = `${suffix}${viewport.width}`;
    const adminEmail = `test.user.alloc.${tag}@example.com`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-alloc-${tag}`,
      clinicName: `Clinica Imputa ${tag}`,
      fullName: 'Ada Admin',
      email: adminEmail,
      password,
    });
    const data = await seed(page, origin, tag);
    const receptionEmail = `test.user.alloc.rec.${tag}@example.com`;
    await addStaffViaApi(page.request, data.admin, {
      fullName: 'Rita Recepción',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });

    // 180 cubre lo realizado y lo aceptado; los 30 que sobran quedan sin imputar.
    const panel = await openPlan(page, origin, data.patientId);
    await expectItem(panel, mobile, data.done, { paid: 100, pending: 0 });
    await expectItem(panel, mobile, data.accepted, { paid: 50, pending: 0 });
    await expectItem(panel, mobile, data.proposed, 'not-billable');
    await expect(unallocatedFigure(panel)).toContainText(money(30));

    // Aceptar el propuesto: el sobrante se le imputa solo.
    await panel
      .getByRole('combobox', { name: 'Estado del ítem del diente 13' })
      .locator('visible=true')
      .selectOption('ACCEPTED');
    await expectItem(panel, mobile, data.proposed, { paid: 30, pending: 40 });
    await expect(unallocatedFigure(panel)).toHaveCount(0);

    // A mano: 20 del realizado pasan al recién aceptado.
    await openPayments(panel);
    let dialog = await openAllocation(page, panel);
    await dialog.getByRole('radio', { name: 'Fijar a mano' }).check();
    const doneField = dialog.getByLabel(`Importe para ${data.done} del diente 11`);
    const newField = dialog.getByLabel(`Importe para ${data.proposed} del diente 13`);
    await expect(doneField).toHaveValue(/^100/);
    await expect(newField).toHaveValue(/^30/);
    await doneField.fill('80');
    await newField.fill('50');
    await expect(dialog).toContainText(`Imputado ${money(180)} · Sin imputar ${money(0)}`);
    if (mobile) await expectDialogInsideViewport(page, dialog);
    await dialog.getByRole('button', { name: 'Guardar imputación' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expectItem(panel, mobile, data.done, { paid: 80, pending: 20 });
    await expectItem(panel, mobile, data.proposed, { paid: 50, pending: 20 });
    await expect(panel.getByText('Fijada a mano', { exact: true }).locator('visible=true')).toBeVisible();

    // De vuelta al reparto automático: lo realizado primero.
    dialog = await openAllocation(page, panel);
    await expect(dialog.getByRole('radio', { name: 'Fijar a mano' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Reparto automático' }).check();
    await dialog.getByRole('button', { name: 'Guardar imputación' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expectItem(panel, mobile, data.done, { paid: 100, pending: 0 });
    await expectItem(panel, mobile, data.accepted, { paid: 50, pending: 0 });
    await expectItem(panel, mobile, data.proposed, { paid: 30, pending: 40 });
    await expect(panel.getByText('Fijada a mano', { exact: true })).toHaveCount(0);

    // Recepción, en su propia sesión: «Ver por ítem» en el estado de cuenta.
    await receptionSees(browser, origin, viewport, data, receptionEmail);

    // Anular el abono libera todo lo imputado.
    await panel.getByRole('button', { name: 'Anular' }).locator('visible=true').first().click();
    const voidDialog = page.getByRole('dialog', { name: '¿Anular este abono?' });
    await voidDialog.getByLabel('Motivo de la anulación').fill('Cobro registrado dos veces');
    await voidDialog.getByRole('button', { name: 'Anular abono' }).click();
    await expect(voidDialog).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByText('Este plan todavía no tiene abonos.')).toBeVisible({ timeout: 10_000 });
    await expectItem(panel, mobile, data.done, { paid: 0, pending: 100 });
    await expectItem(panel, mobile, data.accepted, { paid: 0, pending: 50 });
    await expectItem(panel, mobile, data.proposed, { paid: 0, pending: 70 });
    await expectNoHorizontalScroll(page);
  });
}

/**
 * Contrastes que ya fallaban antes de DX-051, en piezas compartidas que esta
 * tarea no cambia (mismo criterio que `expenses.spec.ts`): se guardan en
 * `axe-*.json` pero no hacen fallar el test. Cualquier otra violación seria o
 * crítica sí.
 */
const PREEXISTING_CONTRAST: { matches: (node: { html: string }) => boolean; why: string }[] = [
  // DX346: éxito ya cumple AA y no se excluye. Se conservan warning/danger históricos.
  { matches: (n) => /class="[^"]*\bbg-(warning|danger)\/15\b/.test(n.html), why: 'Badge tintado warning/danger del sistema' },
];

function isPreexisting(id: string, node: { html: string }): boolean {
  return id === 'color-contrast' && PREEXISTING_CONTRAST.some((p) => p.matches(node));
}

async function audit(page: Page, evidence: string, surface: string, selector: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await page.evaluate(axeSource);
  const results = await page.evaluate(async (include) => {
    const axe = (window as unknown as { axe: { run: (context: string) => Promise<AxeResults> } }).axe;
    return axe.run(include);
  }, selector);
  writeFileSync(path.join(evidence, `axe-${surface}.json`), JSON.stringify(results.violations, null, 2));
  await page.screenshot({ path: path.join(evidence, `${surface}.png`), fullPage: true });
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      nodes: v.nodes.filter((n) => !isPreexisting(v.id, n)).map((n) => `${n.target.join(' ')} :: ${n.failureSummary ?? ''}`),
    }))
    .filter((v) => v.nodes.length > 0);
}

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * Un abono en EUR a un plan en USD: sin tasa (la e2e no tiene proveedor de
 * tasas ni tasa guardada para ese día), así que no tiene base, no se imputa y
 * `GET …/balance` lo cuenta en `unconvertedPaymentsCount`.
 */
async function seedUnconverted(
  page: Page,
  admin: ApiSession,
  tag: string,
): Promise<{ patientId: string; planId: string; itemId: string; procedure: string }> {
  const request = page.request;
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Teo',
    lastName: `SinTasa${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `ST${tag}`.slice(0, 20),
    sex: 'M',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const procedure = `Limpieza${tag}`;
  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `im-rate-${tag}`.slice(0, 40),
    kind: 'PROCEDURE',
    labelEs: procedure,
    color: '#3366CC',
    defaultPrice: 60,
  });
  const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '21',
    catalogItemId: catalog.id,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: admin.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok(), `aceptar el ítem falló: ${await res.text()}`).toBeTruthy();
  await apiPost(request, admin, `/treatment-plans/${plan.id}/payments`, {
    amount: 40,
    currency: 'EUR',
    paidAt: new Date().toISOString(),
    method: 'CARD',
  });
  return { patientId: patient.id, planId: plan.id, itemId: item.id, procedure };
}

/** Otra sesión cambia la imputación por la API: la versión que tiene el modal queda vieja. */
async function changeAllocationBehindTheModal(page: Page, data: Seeded) {
  const url = `${API_URL}/payments/${data.paymentId}/allocations`;
  const read = await page.request.get(url, { headers: data.admin.headers });
  expect(read.ok(), `GET allocations falló: ${await read.text()}`).toBeTruthy();
  const { version } = (await read.json()) as { version: string };
  const res = await page.request.put(url, {
    headers: data.admin.headers,
    data: {
      expectedVersion: version,
      mode: 'MANUAL',
      allocations: [
        { treatmentPlanItemId: data.itemIds.done, amount: 90 },
        { treatmentPlanItemId: data.itemIds.accepted, amount: 50 },
      ],
    },
  });
  expect(res.ok(), `PUT allocations falló: ${await res.text()}`).toBeTruthy();
}

async function backToAuto(page: Page, data: Seeded) {
  const url = `${API_URL}/payments/${data.paymentId}/allocations`;
  const read = await page.request.get(url, { headers: data.admin.headers });
  const { version, manual } = (await read.json()) as { version: string; manual: boolean };
  if (!manual) return;
  const res = await page.request.put(url, {
    headers: data.admin.headers,
    data: { expectedVersion: version, mode: 'AUTO' },
  });
  expect(res.ok(), `PUT AUTO falló: ${await res.text()}`).toBeTruthy();
}

test('DX-051 axe: ítems del plan, «Ver por ítem» y el modal «Imputar abono» (normal, 400, 409 y sin tasa), a 390 y 1440 px, en claro y oscuro', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const evidence = process.env.DX051_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  const tag = `${suffix}axe`;
  const origin = await registerAndLogin(page, {
    subdomain: `test-clinic-alloc-${tag}`,
    clinicName: `Clinica Imputa ${tag}`,
    fullName: 'Ada Admin',
    email: `test.user.alloc.${tag}@example.com`,
    password,
  });
  const data = await seed(page, origin, tag);
  // Sin stub: el saldo de ese plan cuenta el abono sin tasa en
  // `unconvertedPaymentsCount` (antes respondía 500).
  const unconverted = await seedUnconverted(page, data.admin, tag);

  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const label = `${width}-${colorScheme}`;
      const check = async (surface: string, selector: string) =>
        expect.soft(await audit(page, evidence, `${surface}-${label}`, selector), `${surface} ${label}`).toEqual([]);

      // Pestaña del plan: Cobrado/Pendiente por ítem y «Sin imputar».
      const panel = await openPlan(page, origin, data.patientId);
      await expect(unallocatedFigure(panel)).toContainText(money(30));
      await unallocatedFigure(panel).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, `plan-summary-${label}.png`) });
      await openPayments(panel);
      await check('plan', '#tabpanel-treatment-plans');

      // Modal a mano.
      let dialog = await openAllocation(page, panel);
      await dialog.getByRole('radio', { name: 'Fijar a mano' }).check();
      await check('modal', '[role="dialog"]');

      // 400: más de lo que admite el ítem (aviso junto al campo y error del servidor).
      await dialog.getByLabel(`Importe para ${data.done} del diente 11`).fill('130');
      await expect(dialog.getByText(`Este ítem admite como máximo ${money(100)}.`)).toBeVisible();
      await expect(dialog.getByText(`Se guardará: ${money(130)}`)).toBeVisible();
      await dialog.getByRole('button', { name: 'Guardar imputación' }).click();
      await expect(dialog.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
      await check('modal-400', '[role="dialog"]');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // 409: otra sesión cambió la imputación mientras el modal estaba abierto.
      dialog = await openAllocation(page, panel);
      await dialog.getByRole('radio', { name: 'Fijar a mano' }).check();
      await changeAllocationBehindTheModal(page, data);
      await dialog.getByRole('button', { name: 'Guardar imputación' }).click();
      await expect(dialog.getByRole('button', { name: 'Volver a cargar' })).toBeVisible({ timeout: 10_000 });
      await check('modal-409', '[role="dialog"]');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await backToAuto(page, data);

      // Sin tasa: el abono en EUR no se puede imputar todavía.
      const other = await openPlan(page, origin, unconverted.patientId);
      // DX-375: el abono sin tasa lo dice el aviso «sin tasa» junto al saldo.
      await expect(other.getByText('1 abono sin tasa')).toBeVisible();
      await openPayments(other);
      await other.getByRole('button', { name: 'Imputación' }).locator('visible=true').first().click();
      dialog = page.getByRole('dialog', { name: 'Imputar abono' });
      await expect(
        dialog.getByText('No hay tasa de cambio para la fecha de este abono: todavía no se puede imputar.'),
      ).toBeVisible({ timeout: 15_000 });
      await check('modal-no-rate', '[role="dialog"]');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // Estado de cuenta → «Ver por ítem».
      await page.goto(`${origin}/patients/${data.patientId}?tab=account-statement`);
      const statement = page.locator('#tabpanel-account-statement');
      await statement.getByRole('button', { name: /^Ver por ítem/ }).click({ timeout: 15_000 });
      await expect(statement.locator('table[aria-label="Cobrado por ítem del plan"]')).toBeVisible({ timeout: 15_000 });
      await check('statement', '#tabpanel-account-statement');
    }
  }
});

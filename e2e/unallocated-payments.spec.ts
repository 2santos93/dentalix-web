import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { accessTokenOf, loginAs } from './support/auth';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { DAY_MS, SEDE_TZ } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { civilDateInZone } from '../src/lib/format/date';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-399): «a qué se imputó cada abono» y el informe «Cobrado sin
 * imputar» (Reportes) a 1440 y 390 px. Una clínica nueva por corrida (sede en
 * USD): «Ana» tiene un plan de USD 100 y un abono de USD 130 (100 imputados,
 * 30 a cuenta, reparto automático); «Beto», un plan de USD 80 y un abono de
 * USD 60 que el ADMIN fija a mano sin ninguna línea (Manual, 60 a cuenta);
 * «Carla» paga exacto (no sale en el informe). El informe cuadra con el
 * detalle de cada abono; recepción lo ve y lo exporta (y solo ve esa pestaña
 * de Reportes); el odontólogo no la tiene y la API le responde 403. El detalle
 * «Ver imputación» sale del estado de cuenta (ADMIN y recepción) y del plan
 * (ADMIN; recepción no tiene la pestaña Plan). Requiere los dos servidores.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const admin = { fullName: 'Ada Admin', email: `ada.si399.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.si399.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Daniel', email: `daniel.si399.${suffix}@example.com` };
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
// Un día reciente de la sede, dentro de «Últimos 30 días» sea cual sea el reloj de la CI.
const PAID_DAY = civilDateInZone(new Date(Date.now() - 3 * DAY_MS), SEDE_TZ) ?? '';
const REPORT_LIST = 'Abonos con importe sin imputar';
const ITEMS_LIST = 'Ítems a los que se imputó el abono';
// La lista paginada (no el CSV): la misma referencia para poner y quitar la ruta simulada.
const REPORT_URL = /\/reports\/unallocated-payments\?/;

let session: ApiSession;
const ids = { ana: '', beto: '', carla: '', anaPayment: '', betoPayment: '' };
const origin = tenantOrigin(`test-clinic-si399-${suffix}`);

async function patient(request: Parameters<typeof apiPost>[0], firstName: string): Promise<string> {
  return (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName,
      lastName: `Cuenta${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `${firstName.slice(0, 2)}${suffix}`,
      sex: 'F',
    })
  ).id;
}

async function plan(request: Parameters<typeof apiPost>[0], patientId: string, price: number, code: string) {
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `${code}-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Resina ${code}${suffix}`,
    color: '#3366CC',
    defaultPrice: price,
  });
  const created = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${created.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${created.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok()).toBeTruthy();
  return { planId: created.id, procedure: `Resina ${code}${suffix}` };
}

const pay = (request: Parameters<typeof apiPost>[0], planId: string, amount: number) =>
  apiPost<{ id: string }>(request, session, `/treatment-plans/${planId}/payments`, {
    amount,
    currency: 'USD',
    paidAt: PAID_DAY,
    method: 'TRANSFER',
  }).then((p) => p.id);

const procedures = { ana: '', beto: '' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain: `test-clinic-si399-${suffix}`,
    clinicName: `Clinica Imputa 399 ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });

  ids.ana = await patient(request, 'Ana');
  const anaPlan = await plan(request, ids.ana, 100, 'a');
  procedures.ana = anaPlan.procedure;
  ids.anaPayment = await pay(request, anaPlan.planId, 130);

  ids.beto = await patient(request, 'Beto');
  const betoPlan = await plan(request, ids.beto, 80, 'b');
  procedures.beto = betoPlan.procedure;
  ids.betoPayment = await pay(request, betoPlan.planId, 60);
  const read = await request.get(`${API_URL}/payments/${ids.betoPayment}/allocations`, { headers: session.headers });
  const { version } = (await read.json()) as { version: string };
  const fix = await request.put(`${API_URL}/payments/${ids.betoPayment}/allocations`, {
    headers: session.headers,
    data: { expectedVersion: version, mode: 'MANUAL', allocations: [] },
  });
  expect(fix.ok(), `fijar a mano falló: ${await fix.text()}`).toBeTruthy();

  ids.carla = await patient(request, 'Carla');
  const carlaPlan = await plan(request, ids.carla, 50, 'c');
  await pay(request, carlaPlan.planId, 50);
});

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

/** `DataList`: tabla desde 640 px y lista de tarjetas por debajo, con el mismo nombre accesible. */
const listOf = (scope: Page | Locator, width: number, name: string): Locator =>
  scope.getByRole(width < 640 ? 'list' : 'table', { name });
const rowsOf = (scope: Page | Locator, width: number, name: string): Locator =>
  listOf(scope, width, name).getByRole(width < 640 ? 'listitem' : 'row');

async function openReport(page: Page, width: number): Promise<void> {
  await page.goto(`${origin}/reportes?tab=sin-imputar`);
  await page.getByLabel('Período', { exact: true }).selectOption({ label: 'Últimos 30 días' });
  await expect(rowsOf(page, width, REPORT_LIST).filter({ hasText: `Ana Cuenta${suffix}` })).toHaveCount(1, {
    timeout: 15_000,
  });
}

/** Abre el «⋯» del primer abono del estado de cuenta y elige una acción. */
async function openMovementAction(page: Page, action: string): Promise<void> {
  const panel = page.locator('#tabpanel-account-statement');
  await panel.getByRole('button', { name: /^Acciones de abono de/ }).first().click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

for (const viewport of VIEWPORTS) {
  test(`ADMIN: el informe lista a Ana y a Beto con su abono, lo imputado y lo que queda a cuenta (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    await openReport(page, viewport.width);

    const ana = rowsOf(page, viewport.width, REPORT_LIST).filter({ hasText: `Ana Cuenta${suffix}` });
    await expect(ana).toContainText(money(130));
    await expect(ana).toContainText(money(100));
    await expect(ana).toContainText(money(30));
    await expect(ana).toContainText(fmt.civilDate(PAID_DAY));
    const beto = rowsOf(page, viewport.width, REPORT_LIST).filter({ hasText: `Beto Cuenta${suffix}` });
    await expect(beto).toContainText(money(60));
    // Carla pagó exacto: no está.
    await expect(page.getByText(`Carla Cuenta${suffix}`)).toHaveCount(0);
    // Total por moneda: 30 + 60.
    await expect(page.getByLabel('Total sin imputar por moneda')).toContainText(money(90));
    await expect(page.getByRole('status').filter({ hasText: /^2 abonos$/ })).toBeVisible();
    // El paciente enlaza a su estado de cuenta.
    await expect(ana.getByRole('link', { name: new RegExp(`^Ana Cuenta${suffix}`) })).toHaveAttribute(
      'href',
      `/patients/${ids.ana}?tab=account-statement`,
    );
    if (viewport.width >= 640) {
      const headers = listOf(page, viewport.width, REPORT_LIST).getByRole('columnheader');
      await expect(headers).toContainText(['Paciente', 'Sede', 'Fecha del abono', 'Importe del abono', 'Imputado', 'Sin imputar']);
    }

    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, page.getByRole('main'));
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });

  test(`lo que dice el informe es lo que dice el detalle de cada abono (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    const headers = { Authorization: `Bearer ${await accessTokenOf(page)}`, 'X-Tenant-Host': new URL(origin).host };
    for (const [paymentId, name] of [
      [ids.anaPayment, 'Ana'],
      [ids.betoPayment, 'Beto'],
    ] as const) {
      const res = await page.request.get(`${API_URL}/payments/${paymentId}/allocations`, { headers });
      const detail = (await res.json()) as { allocated: number; onAccount: number };
      await openReport(page, viewport.width);
      const row = rowsOf(page, viewport.width, REPORT_LIST).filter({ hasText: `${name} Cuenta${suffix}` });
      await expect(row).toContainText(money(detail.allocated));
      await expect(row).toContainText(money(detail.onAccount));
    }
  });

  test(`RECEPTION: Reportes solo trae esta pestaña, la lista y la exporta en CSV (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, reception.email, password);
    await openReport(page, viewport.width);
    // Una sola vista: sin barra de pestañas.
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(rowsOf(page, viewport.width, REPORT_LIST).filter({ hasText: `Beto Cuenta${suffix}` })).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cobrado-sin-imputar-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain('Cobrado sin imputar / a cuenta');
    expect(csv).toContain(`"Ana Cuenta${suffix}"`);
    expect(csv).toContain(`"Beto Cuenta${suffix}"`);
    expect(csv).not.toContain(`Carla Cuenta${suffix}`);
    await expect(page.getByText('Reporte exportado.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test(`DENTIST no tiene la pestaña y la API le responde 403 (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, dentist.email, password);
    await page.goto(`${origin}/reportes?tab=sin-imputar`);
    // Cae en su única vista (producción): ni la pestaña ni la lista.
    await expect(page.getByRole('tab', { name: 'Cobrado sin imputar' })).toHaveCount(0);
    await expect(page.getByLabel('Sede del abono')).toHaveCount(0);
    await expect(page.getByText(`Ana Cuenta${suffix}`)).toHaveCount(0);
    const headers = { Authorization: `Bearer ${await accessTokenOf(page)}`, 'X-Tenant-Host': new URL(origin).host };
    const res = await page.request.get(`${API_URL}/reports/unallocated-payments?from=${PAID_DAY}&to=${PAID_DAY}`, {
      headers,
    });
    expect(res.status()).toBe(403);
    await expectNoHorizontalScroll(page);
  });

  test(`error al cargar: «Reintentar» recupera la lista; sin cobros, el vacío lo explica (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    // La carga por defecto (Este mes) termina ANTES de poner el fallo: así el 500 es
    // exactamente para la petición del período elegido después.
    const firstLoad = page.waitForResponse(REPORT_URL);
    await page.goto(`${origin}/reportes?tab=sin-imputar`);
    await firstLoad;
    let failures = 1;
    await page.route(REPORT_URL, async (route) => {
      if (failures > 0) {
        failures -= 1;
        await route.fulfill({ status: 500, json: { message: 'Internal server error' } });
        return;
      }
      await route.continue();
    });
    await page.getByLabel('Período', { exact: true }).selectOption({ label: 'Últimos 30 días' });
    await expect(page.getByText('No pudimos cargar lo cobrado sin imputar.')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(rowsOf(page, viewport.width, REPORT_LIST).filter({ hasText: `Ana Cuenta${suffix}` })).toHaveCount(1);

    await page.unroute(REPORT_URL);
    await page.route(REPORT_URL, (route) =>
      route.fulfill({
        json: {
          from: PAID_DAY,
          to: PAID_DAY,
          filters: { locationId: null, locationName: null },
          options: { locations: [] },
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
          totals: [],
          paymentsWithoutRateCount: 0,
        },
      }),
    );
    await page.getByLabel('Período', { exact: true }).selectOption({ label: 'Este año' });
    await expect(page.getByText('No hay cobros sin imputar en este período')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test(`estado de cuenta (RECEPTION): «Ver imputación» dice ítem, importe, regla y A cuenta (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, reception.email, password);

    // Ana: reparto automático; 100 al ítem y 30 a cuenta.
    await page.goto(`${origin}/patients/${ids.ana}?tab=account-statement`);
    await openMovementAction(page, 'Ver imputación');
    const dialog = page.getByRole('dialog', { name: 'Imputación del abono' });
    await expect(dialog.getByText('Automática (más antiguo primero)')).toBeVisible({ timeout: 15_000 });
    const lines = rowsOf(dialog, viewport.width, ITEMS_LIST);
    await expect(lines.filter({ hasText: procedures.ana })).toContainText(money(100));
    await expect(lines.filter({ hasText: 'A cuenta' })).toContainText(money(30));
    await expect(dialog.getByRole('button', { name: 'Cambiar imputación' })).toHaveCount(0);
    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, dialog);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
    await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
    await expect(dialog).toHaveCount(0);

    // Beto: fijado a mano sin líneas; todo a cuenta.
    await page.goto(`${origin}/patients/${ids.beto}?tab=account-statement`);
    await openMovementAction(page, 'Ver imputación');
    const manual = page.getByRole('dialog', { name: 'Imputación del abono' });
    await expect(manual.getByText('Manual', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(rowsOf(manual, viewport.width, ITEMS_LIST).filter({ hasText: 'A cuenta' })).toContainText(money(60));
  });

  test(`plan de tratamiento (ADMIN): «Ver imputación» abre el detalle y permite pasar a cambiarla (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${ids.ana}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');
    await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
    const fold = panel.getByRole('button', { name: /^Abonos registrados\s+\d+ abonos?$/ });
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await panel.getByRole('button', { name: /^Acciones de abono/ }).first().click();
    await page.getByRole('menuitem', { name: 'Ver imputación', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Imputación del abono' });
    await expect(dialog.getByText('Automática (más antiguo primero)')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Cambiar imputación' }).click();
    await expect(page.getByRole('dialog', { name: 'Imputar abono' })).toBeVisible({ timeout: 15_000 });
  });
}

test('la imputación a mano deja el abono «Manual» en el detalle y vuelve a «Automática» (1440 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const headers = { Authorization: `Bearer ${await accessTokenOf(page)}`, 'X-Tenant-Host': new URL(origin).host };
  const read = await page.request.get(`${API_URL}/payments/${ids.betoPayment}/allocations`, { headers });
  const { version } = (await read.json()) as { version: string };
  const back = await page.request.put(`${API_URL}/payments/${ids.betoPayment}/allocations`, {
    headers,
    data: { expectedVersion: version, mode: 'AUTO' },
  });
  expect(back.ok(), `AUTO falló: ${await back.text()}`).toBeTruthy();
  await page.goto(`${origin}/patients/${ids.beto}?tab=account-statement`);
  await openMovementAction(page, 'Ver imputación');
  const dialog = page.getByRole('dialog', { name: 'Imputación del abono' });
  await expect(dialog.getByText('Automática (más antiguo primero)')).toBeVisible({ timeout: 15_000 });
  await expect(rowsOf(dialog, 1440, ITEMS_LIST).filter({ hasText: procedures.beto })).toContainText(money(60));
  // Ya no queda nada a cuenta: el informe tampoco lo lista.
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
  await page.goto(`${origin}/reportes?tab=sin-imputar`);
  await page.getByLabel('Período', { exact: true }).selectOption({ label: 'Últimos 30 días' });
  await expect(rowsOf(page, 1440, REPORT_LIST).filter({ hasText: `Ana Cuenta${suffix}` })).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.getByText(`Beto Cuenta${suffix}`)).toHaveCount(0);
});

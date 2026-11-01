import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-515): el recibo de caja no es una factura.
 *
 * Una clínica nueva por corrida:
 *  1. Sin configurar, el recibo sale con «Recibo de caja» y sin leyenda.
 *  2. El ADMIN pone en Ajustes › Caja el título «Recibo de pago» y la leyenda
 *     sugerida; el recibo NUEVO los lleva en A4 y en 80 mm; el ANTERIOR, al
 *     reimprimirlo, sigue sin ellos (foto congelada al emitir).
 *  3. La sede usa su propia leyenda desde su ficha; el siguiente recibo la lleva.
 *  4. Recepción anota en la caja el nº de la factura fiscal externa (texto
 *     libre): sale en la fila, el filtro «Con nº» la deja y «Sin nº» la quita;
 *     el recibo emitido no cambia.
 *  5. Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR; sin scroll
 *     horizontal a 390.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `recnf-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Ajustes', email: `admin.recnf.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `recep.recnf.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

let session: ApiSession;
let receptionSession: ApiSession;
let planId = '';
let locationId = '';
const payments = { before: '', after: '', sede: '' };

async function pay(request: APIRequestContext, amount: number): Promise<string> {
  return (
    await apiPost<{ id: string }>(request, receptionSession, `/treatment-plans/${planId}/payments`, {
      amount,
      currency: 'COP',
      paidAt: new Date().toISOString(),
      method: 'CASH',
    })
  ).id;
}

async function shoot(page: Page, name: string, width: number, focus?: Locator): Promise<void> {
  if (!QA_DIR) return;
  // El contenido desplaza dentro del shell: se enseña la pieza que cambió.
  // Tras cambiar el ancho la lista pasa de tabla a tarjetas: se espera a la nueva.
  if (focus) {
    await expect(focus.first()).toBeVisible({ timeout: 15_000 });
    await focus.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function openPrint(page: Page, paymentId: string, roll = false): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/payments/${paymentId}/receipt${roll ? '?formato=80mm' : ''}`);
  await expect(page.getByTestId('receipt-document')).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Recibo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  receptionSession = await apiLogin(request, origin, reception.email, password);
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName: `Recibo${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `RNF${suffix}`.slice(0, 20),
    sex: 'F',
  });
  planId = (
    await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, { currency: 'COP' })
  ).id;
  const settings = (await (
    await request.get(`${API_URL}/payment-receipts/settings`, { headers: session.headers })
  ).json()) as { locations: { locationId: string }[] };
  locationId = settings.locations[0].locationId;
  payments.before = await pay(request, 10_000);
});

test('sin configurar: «Recibo de caja» y ninguna leyenda', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await openPrint(page, payments.before);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibo de caja');
  await expect(page.getByTestId('receipt-legend')).toHaveCount(0);
});

test('el ADMIN configura título y leyenda en Ajustes › Caja; el recibo nuevo los lleva y el anterior no', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/caja`);
  const title = page.getByRole('textbox', { name: 'Título del recibo' });
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(title).toHaveValue('');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'settings-empty', viewport.width, page.getByRole('textbox', { name: 'Leyenda del recibo' }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await title.fill('Recibo de pago');
  await page.getByRole('button', { name: 'Usar «Este recibo no es una factura»' }).click();
  await expect(page.getByRole('textbox', { name: 'Leyenda del recibo' })).toHaveValue('Este recibo no es una factura');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'settings-dirty', viewport.width, page.getByRole('region', { name: 'Cambios sin guardar' }));
  }
  await page.getByRole('button', { name: 'Guardar el título y la leyenda del recibo' }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Título del recibo' })).toHaveValue('Recibo de pago', { timeout: 15_000 });

  payments.after = await pay(request, 20_000);
  for (const roll of [false, true]) {
    await openPrint(page, payments.after, roll);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibo de pago');
    await expect(page.getByTestId('receipt-legend')).toHaveText('Este recibo no es una factura');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, roll ? 'receipt-80mm-legend' : 'receipt-a4-legend', viewport.width);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  // El recibo emitido antes de configurarlo se reimprime igual que entonces.
  await openPrint(page, payments.before);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibo de caja');
  await expect(page.getByTestId('receipt-legend')).toHaveCount(0);
});

test('la sede usa su propia leyenda desde su ficha', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/sedes/${locationId}`);
  await expect(page.getByTestId('inherited-legend')).toContainText('Este recibo no es una factura', {
    timeout: 15_000,
  });
  await page.getByRole('checkbox', { name: 'Usar una leyenda propia en esta sede' }).check();
  await page.getByRole('textbox', { name: 'Leyenda de esta sede' }).fill('Comprobante interno de la sede');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'sede-legend', viewport.width, page.getByRole('region', { name: 'Cambios sin guardar' }));
  }
  await page.getByRole('button', { name: /^Guardar la leyenda del recibo de / }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toHaveCount(0, { timeout: 15_000 });

  payments.sede = await pay(request, 5_000);
  await openPrint(page, payments.sede);
  await expect(page.getByTestId('receipt-legend')).toHaveText('Comprobante interno de la sede');
});

test('recepción anota el nº de factura externa en la caja y filtra por él', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/caja`);
  const table = dataList(page.locator('main'), /abonos del período/i);
  await expect(table).toBeVisible({ timeout: 15_000 });
  const row = dataListRows(table).filter({ hasText: '20.000' });
  await rowAction(page, row, 'Factura externa');
  const dialog = page.getByRole('dialog', { name: 'Nº de la factura fiscal' });
  await dialog.getByLabel('Nº de factura').fill('A/2026 #00-77');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectDialogInsideViewport(page, dialog);
    await shoot(page, 'invoice-modal', viewport.width);
  }
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  await expect(dataListRows(table).filter({ hasText: 'Fact. A/2026 #00-77' })).toHaveCount(1, { timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'cash-invoice', viewport.width, dataListRows(table).filter({ hasText: 'Fact. A/2026 #00-77' }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  const filter = page.getByRole('combobox', { name: 'Factura externa' });
  const rowWith = (text: string) => dataListRows(table).filter({ hasText: text });
  await filter.selectOption({ label: 'Con nº de factura externa' });
  await expect(rowWith('10.000')).toHaveCount(0, { timeout: 15_000 });
  await expect(rowWith('20.000')).toHaveCount(1);
  await expect(rowWith('5000')).toHaveCount(0);
  await filter.selectOption({ label: 'Sin nº de factura externa' });
  await expect(rowWith('20.000')).toHaveCount(0, { timeout: 15_000 });
  await expect(rowWith('10.000')).toHaveCount(1);
  await expect(rowWith('5000')).toHaveCount(1);
  await expect(rowWith('Fact.')).toHaveCount(0);

  // «5000»: el formato «es» no agrupa los miles de cuatro cifras.
  // El recibo de ese abono no cambia: no lleva el nº externo.
  await openPrint(page, payments.after);
  await expect(page.getByTestId('receipt-document')).not.toContainText('A/2026 #00-77');
});

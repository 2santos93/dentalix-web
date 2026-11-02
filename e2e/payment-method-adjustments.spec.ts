import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { dataList, dataListRows } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-516): ajustes por medio de pago.
 *
 * Una clínica nueva por corrida:
 *  1. Por defecto ningún medio tiene ajustes (Ajustes › Caja lo dice).
 *  2. El ADMIN crea «Impuesto 3 %» en el efectivo; la lista lo muestra.
 *  3. Recepción registra un abono de 100,00: el modal anticipa +3,00 y
 *     «Total a cobrar 103,00»; el recibo (A4 y 80 mm) lleva el ajuste y lo
 *     cobrado; la caja, «Cobrado 103,00» y el resumen de ajustes.
 *  4. Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR; sin scroll
 *     horizontal a 390.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `ajmp-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Ajustes', email: `admin.ajmp.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `recep.ajmp.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

let session: ApiSession;
let patientId = '';
let paymentId = '';

async function shoot(page: Page, name: string, width: number, focus?: Locator): Promise<void> {
  if (!QA_DIR) return;
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

async function seedPlan(request: APIRequestContext): Promise<void> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName: `Ajuste${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `AJ${suffix}`.slice(0, 20),
    sex: 'F',
  });
  patientId = patient.id;
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `dx516-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX516 ${suffix}`,
    color: '#3366CC',
    defaultPrice: 900,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 900,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ajustes ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await apiLogin(request, origin, reception.email, password);
  await seedPlan(request);
});

test('el ADMIN crea un impuesto del 3 % en el efectivo desde Ajustes › Caja', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/caja`);
  const section = page.getByRole('region', { name: 'Ajustes por medio de pago' });
  await expect(section.getByText('Ningún medio de pago tiene ajustes.')).toBeVisible({ timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'settings-empty', viewport.width, section);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await section.getByRole('button', { name: 'Nuevo ajuste' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo ajuste por medio de pago' });
  await dialog.getByLabel('Medio de pago').selectOption({ label: 'Efectivo' });
  await dialog.getByLabel('Etiqueta').fill('Impuesto 3 %');
  await dialog.getByLabel('Porcentaje', { exact: true }).fill('3');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectDialogInsideViewport(page, dialog);
    await shoot(page, 'adjustment-modal', viewport.width);
  }
  await dialog.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Recargo' });
  await expect(dialog.getByText(/En algunos lugares cobrar un recargo/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await shoot(page, 'adjustment-modal-surcharge', 1440);
  await dialog.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Impuesto' });
  await dialog.getByRole('button', { name: 'Crear ajuste' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const list = dataList(section, 'Ajustes por medio de pago');
  await expect(dataListRows(list).filter({ hasText: 'Impuesto 3 %' })).toHaveCount(1, { timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'settings-list', viewport.width, section);
  }
});

test('recepción cobra 100,00 en efectivo: el modal anticipa el impuesto y el total a cobrar', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const panel = page.locator('#tabpanel-account-statement');
  await panel.getByRole('button', { name: 'Registrar abono' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel('Importe').fill('100');
  await dialog.getByLabel('Método').selectOption({ label: 'Efectivo' });
  const preview = dialog.getByRole('region', { name: 'Ajustes de este medio de pago' });
  await expect(preview).toContainText('Impuesto 3 %');
  await expect(preview).toContainText('+3,00 USD', { timeout: 15_000 });
  await expect(preview).toContainText('103,00 USD');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectDialogInsideViewport(page, dialog);
    await shoot(page, 'payment-modal', viewport.width, preview);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const saved = page.waitForResponse(
    (res) => /\/treatment-plans\/[^/]+\/payments$/.test(res.url()) && res.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Registrar abono' }).click();
  const body = (await (await saved).json()) as { id: string; collectedAmount: number; amount: number };
  expect(body).toMatchObject({ amount: 100, collectedAmount: 103 });
  paymentId = body.id;
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});

test('el recibo (A4 y 80 mm) lleva el impuesto y lo cobrado; la caja también', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  for (const roll of [false, true]) {
    await page.goto(`${origin}/print/payments/${paymentId}/receipt${roll ? '?formato=80mm' : ''}`);
    const adjustments = page.getByTestId('receipt-adjustments');
    await expect(adjustments).toContainText('Impuesto 3 %', { timeout: 15_000 });
    await expect(adjustments).toContainText('+USD 3,00');
    await expect(adjustments).toContainText('Total cobrado');
    await expect(adjustments).toContainText('USD 103,00');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, roll ? 'receipt-80mm' : 'receipt-a4', viewport.width);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto(`${origin}/caja`);
  const table = dataList(page.locator('main'), /abonos del período/i);
  await expect(dataListRows(table).filter({ hasText: 'Cobrado 103,00' })).toHaveCount(1, { timeout: 15_000 });
  const summary = page.getByRole('region', { name: /resumen del período/i });
  await expect(summary.getByRole('list', { name: 'Ajustes por medio de pago' })).toContainText('+3,00');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'cash', viewport.width, summary);
  }
});

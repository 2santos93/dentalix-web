import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { apiLogin, type ApiSession } from './support/api';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { DEMO_CURRENCY } from './support/demo';

/**
 * e2e (DX-569): el paciente reporta su pago por enlace y la caja lo confirma.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   1. Flujo completo: la administradora crea en Ajustes › Caja un medio
 *      «Permitir en el enlace de pago» con sus datos para pagar; recepción
 *      crea el enlace desde el estado de cuenta («Solo copiar el enlace»); la
 *      paciente lo abre sin sesión a 390 px, ve el importe y los datos, y
 *      reporta con comprobante; el mismo enlace después dice «Ya recibimos tu
 *      reporte de pago»; recepción lo confirma en Caja › Por confirmar, se
 *      ofrece el recibo y el abono sale en el estado de cuenta.
 *   2. Rechazar: un reporte hecho por la API se rechaza con motivo en la bandeja.
 *   3. Accesibilidad de la página pública (axe, 390 px).
 * Cada prueba siembra su propio medio y paciente.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function send<T>(
  request: APIRequestContext,
  session: ApiSession,
  method: 'post' | 'patch' | 'put',
  path: string,
  data: object,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Paciente con un plan aceptado en la moneda de la sede (900). */
async function seedPatient(request: APIRequestContext, session: ApiSession, tag: string, lastName: string) {
  const patient = await send<{ id: string }>(request, session, 'post', '/patients', {
    firstName: 'Enlace',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `DX569${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await send<{ id: string }>(request, session, 'post', '/catalog/items', {
    code: `dx569-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX569 ${tag}`,
    color: '#3366CC',
    defaultPrice: 900,
  });
  const plan = await send<{ id: string }>(request, session, 'post', `/patients/${patient.id}/treatment-plans`, {
    currency: DEMO_CURRENCY,
  });
  const item = await send<{ id: string }>(request, session, 'post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 900,
  });
  await send(request, session, 'patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  return { patientId: patient.id, planId: plan.id };
}

/** Un medio permitido en el enlace con datos para toda la clínica, por la API. */
async function seedMethod(request: APIRequestContext, session: ApiSession, name: string): Promise<string> {
  const method = await send<{ id: string }>(request, session, 'post', '/payment-methods', {
    name,
    kind: 'DIGITAL',
    requiresReference: false,
    proofPolicy: 'NONE',
    allowInPaymentLink: true,
  });
  await send(request, session, 'put', `/payment-methods/${method.id}/instructions`, {
    holderName: 'Clínica Demo C.A.',
    phone: '0414-5550101',
  });
  return method.id;
}

test.describe('enlace de pago (DX-569)', () => {
  test('flujo completo: datos para pagar → enlace → reporte con comprobante → confirmar → abono', async ({ browser }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}a`;
    const methodName = `Enlace ${tag}`;
    const desktop = { width: 1440, height: 900 };

    // --- ADMIN: el medio, permitido en el enlace, y sus datos para pagar.
    const adminContext = await browser.newContext({ viewport: desktop });
    const admin = await adminContext.newPage();
    await login(admin, origin, ADMIN_EMAIL);
    await admin.goto(`${origin}/settings/caja`);
    const methods = admin.getByRole('region', { name: 'Medios de pago' });
    await methods.getByRole('button', { name: 'Nuevo medio' }).click();
    const form = admin.getByRole('dialog', { name: 'Nuevo medio de pago' });
    await form.getByLabel('Nombre', { exact: true }).fill(methodName);
    await form.getByLabel('Pide referencia', { exact: true }).uncheck();
    await form.getByLabel('Pide comprobante', { exact: true }).selectOption({ label: 'Opcional' });
    await form.getByLabel('Permitir en el enlace de pago', { exact: true }).check();
    await form.getByRole('button', { name: 'Crear medio' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    const instructions = admin.getByRole('region', { name: 'Datos para pagar' });
    await expect(instructions.getByText(`«${methodName}»: no se mostrará en el enlace hasta que tenga datos para pagar.`)).toBeVisible({
      timeout: 15_000,
    });
    await instructions.getByRole('button', { name: 'Añadir datos para pagar' }).click();
    const data = admin.getByRole('dialog', { name: 'Añadir datos para pagar' });
    await data.getByLabel('Medio de pago', { exact: true }).selectOption({ label: methodName });
    await data.getByLabel('Para', { exact: true }).selectOption({ label: 'Toda la clínica' });
    await data.getByLabel('Titular', { exact: true }).fill('Clínica Demo C.A.');
    await data.getByLabel('Teléfono', { exact: true }).fill('0414-5550101');
    await data.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(data).toBeHidden({ timeout: 10_000 });
    await expect(instructions.getByText(`«${methodName}»: no se mostrará`)).toBeHidden();
    const session = await apiLogin(admin.request, origin, ADMIN_EMAIL, DEMO_PASSWORD);
    const { patientId } = await seedPatient(admin.request, session, tag, `Pago${tag}`);
    await adminContext.close();

    // --- Recepción: «Enviar enlace de pago» desde el estado de cuenta.
    const context = await browser.newContext({ viewport: desktop });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const panel = page.locator('#tabpanel-account-statement');
    await panel.getByRole('button', { name: 'Enviar enlace de pago' }).click();
    const modal = page.getByRole('dialog', { name: 'Enviar enlace de pago' });
    await expect(modal.getByLabel('Importe que se pide', { exact: true })).toHaveValue('900');
    await modal.getByRole('radio', { name: 'Solo copiar el enlace' }).check();
    await modal.getByRole('button', { name: 'Crear enlace' }).click();
    const url = await modal.getByLabel('Enlace de pago', { exact: true }).inputValue({ timeout: 15_000 });
    expect(url).toMatch(/\/pago\/[A-Za-z0-9_-]+$/);
    await expect(modal.getByRole('region', { name: 'Enlaces enviados' }).getByText('Vigente')).toBeVisible();
    await expectDialogInsideViewport(page, modal);
    await page.keyboard.press('Escape');

    // --- La paciente, sin sesión y a 390 px: ve el importe y los datos, y reporta.
    const patientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const patient = await patientContext.newPage();
    await patient.goto(url);
    await expect(patient.getByRole('heading', { level: 1, name: 'Reporta tu pago' })).toBeVisible({ timeout: 15_000 });
    await expect(patient.getByText('Hola, Enlace.')).toBeVisible();
    const how = patient.getByRole('region', { name: methodName });
    await expect(how.getByText('0414-5550101')).toBeVisible();
    await expect(how.getByRole('button', { name: `Copiar teléfono de ${methodName}` })).toBeVisible();
    await expectNoHorizontalScroll(patient);
    await patient.getByRole('radio', { name: methodName }).check();
    await patient.getByLabel('Referencia del pago (opcional)', { exact: true }).fill(`REF${tag}`);
    await patient.getByLabel(/Comprobante \(opcional\)/).setInputFiles({
      name: 'captura.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await expect(patient.getByTestId('proof-staged')).toContainText('captura.png', { timeout: 15_000 });
    await patient.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(patient.getByRole('heading', { level: 1, name: 'Recibimos tu reporte de pago' })).toBeVisible({
      timeout: 15_000,
    });
    // El mismo enlace otra vez: ya se usó (410).
    await patient.goto(url);
    await expect(patient.getByRole('heading', { level: 1, name: 'Ya recibimos tu reporte de pago' })).toBeVisible({
      timeout: 15_000,
    });
    await patientContext.close();

    // --- Recepción: Caja › Por confirmar → Confirmar → recibo → abono en el estado de cuenta.
    await page.goto(`${origin}/caja?tab=por-confirmar`);
    const inbox = dataList(page, /Pagos reportados/);
    await expect(inbox).toBeVisible({ timeout: 15_000 });
    const row = dataListRows(inbox).filter({ hasText: `Pago${tag}` });
    await expect(row.getByText(`REF${tag}`)).toBeVisible();
    await rowAction(page, row, 'Confirmar');
    const confirm = page.getByRole('dialog', { name: 'Confirmar pago reportado' });
    await expect(confirm.getByLabel('Importe recibido', { exact: true })).toHaveValue('900');
    await expect(confirm.getByLabel('Método', { exact: true })).toHaveValue(/.+/);
    await expectDialogInsideViewport(page, confirm);
    await confirm.getByRole('button', { name: 'Confirmar pago' }).click();
    await expect(page.getByRole('dialog', { name: 'Recibo de caja' })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const movements = dataList(page.locator('#tabpanel-account-statement'), /movimientos/i);
    await expect(dataListRows(movements).filter({ hasText: methodName })).toHaveCount(1, { timeout: 15_000 });
    await context.close();
  });

  test('rechazar un pago reportado con motivo', async ({ browser, request }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}r`;
    const session = await apiLogin(request, origin, ADMIN_EMAIL, DEMO_PASSWORD);
    const methodId = await seedMethod(request, session, `Rechazo ${tag}`);
    const { patientId, planId } = await seedPatient(request, session, tag, `Rechazo${tag}`);
    const link = await send<{ url: string }>(request, session, 'post', `/patients/${patientId}/payment-links`, {
      target: { treatmentPlanId: planId },
      amount: 100,
      channel: null,
    });
    const token = link.url.split('/pago/')[1];
    const publicHeaders = { 'X-Tenant-Host': new URL(origin).host };
    const view = await request.get(`${API_URL}/public/payment-links/${token}`, { headers: publicHeaders });
    expect(view.ok(), await view.text()).toBeTruthy();
    const { paidOnMax, currency } = (await view.json()) as { paidOnMax: string; currency: string };
    const report = await request.post(`${API_URL}/public/payment-links/${token}/report`, {
      headers: publicHeaders,
      data: { paymentMethodId: methodId, currency, amount: 100, paidOn: paidOnMax },
    });
    expect(report.ok(), await report.text()).toBeTruthy();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/caja?tab=por-confirmar`);
    const inbox = dataList(page, /Pagos reportados/);
    await expect(inbox).toBeVisible({ timeout: 15_000 });
    const row = dataListRows(inbox).filter({ hasText: `Rechazo${tag}` });
    await rowAction(page, row, 'Rechazar');
    const dialog = page.getByRole('dialog', { name: '¿Rechazar este pago reportado?' });
    await dialog.getByLabel('Motivo (interno)', { exact: true }).fill('No llegó a la cuenta');
    await dialog.getByRole('button', { name: 'Rechazar pago' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(dataListRows(inbox).filter({ hasText: `Rechazo${tag}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Rechazados' }).click();
    await expect(dataListRows(dataList(page, /Pagos reportados/)).filter({ hasText: `Rechazo${tag}` })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expectNoHorizontalScroll(page);
    await context.close();
  });

  test('la página pública es accesible a 390 px', async ({ browser, request }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}x`;
    const session = await apiLogin(request, origin, ADMIN_EMAIL, DEMO_PASSWORD);
    await seedMethod(request, session, `Accesible ${tag}`);
    const { patientId, planId } = await seedPatient(request, session, tag, `Axe${tag}`);
    const link = await send<{ url: string }>(request, session, 'post', `/patients/${patientId}/payment-links`, {
      target: { treatmentPlanId: planId },
      amount: 50,
      channel: null,
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(link.url);
    await expect(page.getByRole('heading', { level: 1, name: 'Reporta tu pago' })).toBeVisible({ timeout: 15_000 });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    // Sin datos, los errores se anuncian junto a su campo y el foco va al primero.
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Elige el medio con que pagaste.')).toBeVisible();
    await expect(page.getByRole('radio').first()).toBeFocused();
    await expectNoHorizontalScroll(page);
    await context.close();
  });
});

import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { DEMO_CURRENCY } from './support/demo';

/**
 * e2e (DX-389): comprobante del cobro adjunto al abono.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - la administradora crea en Ajustes › Caja un medio digital con «Pide
 *     comprobante» = Obligatorio (la recepción no tiene la pestaña Plan ni
 *     Ajustes: el medio lo crea ADMIN);
 *   - recepción registra un abono con ese medio: sin comprobante, el modal lo
 *     pide junto al campo; sube una captura PNG pequeña (progreso, «Subido» y
 *     previsualización) y el abono se registra;
 *   - recepción abre «Ver comprobante» desde el estado de cuenta y ve la
 *     imagen (URL firmada de vida corta, auditada).
 * En 1440 px (tabla) y 390 px (lista de tarjetas, sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

/** Un PNG de 1×1 píxel (válido por contenido: firma de 8 bytes + IHDR). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PROOF_NAME = 'captura-pago-movil.png';

/** Paciente con un plan en la moneda de la sede (USD) aceptado, sembrado como ADMIN por la API. */
async function seedPatient(request: APIRequestContext, origin: string, tag: string): Promise<string> {
  const host = new URL(origin).host;
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok(), `login admin falló: ${await login.text()}`).toBeTruthy();
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
  };
  async function send<T>(method: 'post' | 'patch', path: string, data: object): Promise<T> {
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await send<{ id: string }>('post', '/patients', {
    firstName: 'Comprobante',
    lastName: `Cobro${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX389${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await send<{ id: string }>('post', '/catalog/items', {
    code: `dx389-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX389 ${tag}`,
    color: '#3366CC',
    defaultPrice: 900,
  });
  const plan = await send<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: DEMO_CURRENCY,
  });
  const item = await send<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 900,
  });
  await send('patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  return patient.id;
}

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

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`el comprobante del cobro: se exige, se sube, se previsualiza y se ve (${viewport.name})`, async ({
    browser,
  }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const methodName = `Comprobante ${tag}`;

    // --- ADMIN: un medio digital que exige comprobante (Ajustes › Caja).
    const adminContext = await browser.newContext({ viewport });
    const admin = await adminContext.newPage();
    await login(admin, origin, ADMIN_EMAIL);
    await admin.goto(`${origin}/settings/caja`);
    const section = admin.getByRole('region', { name: 'Medios de pago' });
    await expect(section.getByText('Pago móvil').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await section.getByRole('button', { name: 'Nuevo medio' }).click();
    const form = admin.getByRole('dialog', { name: 'Nuevo medio de pago' });
    await form.getByLabel('Nombre').fill(methodName);
    await form.getByLabel('Tipo base').selectOption({ label: 'Digital' });
    await form.getByLabel('Pide referencia').uncheck();
    await expect(form.getByLabel('Pide comprobante')).toHaveValue('NONE');
    await form.getByLabel('Pide comprobante').selectOption({ label: 'Obligatorio' });
    await expectDialogInsideViewport(admin, form);
    await form.getByRole('button', { name: 'Crear medio' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    await expect(section.getByText(methodName).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(admin);
    const patientId = await seedPatient(admin.request, origin, tag);
    await adminContext.close();

    // --- Recepción: «Registrar abono» con comprobante obligatorio.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const panel = page.locator('#tabpanel-account-statement');
    await panel.getByRole('button', { name: 'Registrar abono' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Importe').fill('50');
    await dialog.getByLabel('Método').selectOption({ label: methodName });
    await expect(dialog.getByText('Comprobante del cobro (obligatorio)')).toBeVisible();

    // Sin comprobante: el motivo va junto al campo y no se registra.
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(
      dialog.getByText('Este medio de pago exige el comprobante del cobro. Adjúntalo para registrar el abono.'),
    ).toBeVisible();

    // Un PNG pequeño desde el fixture: sube, queda «Subido» y se previsualiza.
    await dialog.locator('#rp-proof').setInputFiles({ name: PROOF_NAME, mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(dialog.getByText('Subido')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('img', { name: `Vista previa de ${PROOF_NAME}` })).toBeVisible();
    await expectDialogInsideViewport(page, dialog);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // --- «Ver comprobante» desde el estado de cuenta (tabla en 1440, tarjeta en 390).
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const table = dataList(page.locator('#tabpanel-account-statement'), /movimientos/i);
    await expect(table).toBeVisible({ timeout: 15_000 });
    const row = dataListRows(table).filter({ hasText: methodName });
    await rowAction(page, row, 'Ver comprobante');
    const viewer = page.getByRole('dialog', { name: PROOF_NAME });
    await expect(viewer.getByRole('img', { name: PROOF_NAME })).toBeVisible({ timeout: 15_000 });
    await expectDialogInsideViewport(page, viewer);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await context.close();
  });
}

import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { demoNationalIdLabel } from './support/demo';

/**
 * e2e (DX-136): recibo de caja numerado por sede.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - la administradora crea por la API un paciente (con email y documento) y
 *     un plan en COP; recepción registra abonos por la API, y cada uno trae
 *     su número de la serie de la sede principal (`PRI-000123`);
 *   - recepción abre el recibo desde el estado de cuenta: número, clínica,
 *     «Datos fiscales pendientes», documento enmascarado, quién cobró y el
 *     pie «Este documento no es factura»; lo envía por email y lo imprime en
 *     A4 y en tirilla de 80 mm (en `media: print` solo queda el documento; el
 *     PDF sale en una hoja A4 o en el ancho de la tirilla);
 *   - un abono anulado conserva su número y sale «ANULADO» con motivo y fecha,
 *     en pantalla y en la impresión;
 *   - un rol sin permiso de cobro: 403 en español en la API y aviso en la vista.
 * En escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 *
 * Supone una BD e2e recién sembrada (DX-335): una demo reutilizada conserva lo que dejaron otras ejecuciones.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

// Mismo formateador que la app (`formatCurrency`, locale `es`): solo la cifra.
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP', currencyDisplay: 'code' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

interface Seeded {
  patientId: string;
  fullName: string;
  docNumber: string;
  payments: { id: string; receiptNumber: string; amount: number }[];
}

/** ADMIN crea paciente y plan; RECEPCIÓN registra los abonos (es quien cobra). */
async function seed(request: APIRequestContext, host: string, tag: string, amounts: number[]): Promise<Seeded> {
  const admin = { 'X-Tenant-Host': host, Authorization: `Bearer ${await apiLogin(request, host, ADMIN_EMAIL)}` };
  const reception = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${await apiLogin(request, host, RECEPTION_EMAIL)}`,
  };
  async function post<T>(headers: Record<string, string>, path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const lastName = `Recibo${tag}`;
  const docNumber = `10${Date.now().toString().slice(-8)}`;
  const patient = await post<{ id: string }>(admin, '/patients', {
    firstName: 'Carolina',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber,
    sex: 'F',
    email: `recibo-${tag}@example.com`,
  });
  const plan = await post<{ id: string }>(admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const payments: Seeded['payments'] = [];
  for (const amount of amounts) {
    const payment = await post<{ id: string; receiptNumber: string }>(
      reception,
      `/treatment-plans/${plan.id}/payments`,
      { amount, currency: 'COP', paidAt: new Date().toISOString(), method: 'CASH' },
    );
    expect(payment.receiptNumber).toMatch(/^PRI-\d{6,}$/);
    payments.push({ id: payment.id, receiptNumber: payment.receiptNumber, amount });
  }
  return { patientId: patient.id, fullName: `Carolina ${lastName}`, docNumber, payments };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
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

/** Ancho (pt) de la primera hoja de un PDF, leído de su /MediaBox. */
function pdfPageWidth(pdf: Buffer): number {
  const match = /\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+[\d.]+\s*\]/.exec(pdf.toString('latin1'));
  if (!match) throw new Error('PDF sin /MediaBox');
  return Number(match[1]);
}

/** Nº de hojas de un PDF (cuenta los objetos /Type /Page, no /Pages). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** Abre el estado de cuenta del paciente y el recibo del abono de `amount`. */
async function openReceiptFromStatement(page: Page, origin: string, patientId: string, amount: number) {
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const panel = page.locator('#tabpanel-account-statement');
  // UX v2: «Recibo» vive en el «⋯» del movimiento (tabla o tarjeta).
  const table = dataList(panel, /movimientos/i);
  await expect(table).toBeVisible({ timeout: 15_000 });
  const row = dataListRows(table).filter({ hasText: figure(amount) });
  await rowAction(page, row, 'Recibo');
  const dialog = page.getByRole('dialog', { name: 'Recibo de caja' });
  await expect(dialog.getByTestId('receipt-document')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción ve, envía e imprime el recibo numerado en A4 y en tirilla (${viewport.name})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const data = await seed(page.request, host, `${suffix}${viewport.width}`, [125_000, 80_000]);
    const [first, second] = data.payments;
    // Consecutivos dentro de la serie de la sede.
    expect(Number(second.receiptNumber.split('-')[1])).toBe(Number(first.receiptNumber.split('-')[1]) + 1);

    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await webLogin(page, origin, RECEPTION_EMAIL);
    const dialog = await openReceiptFromStatement(page, origin, data.patientId, first.amount);
    const doc = dialog.getByTestId('receipt-document');
    await expect(doc).toContainText(`N.º ${first.receiptNumber}`);
    await expect(doc).toContainText('Clínica Demo');
    await expect(doc).toContainText('Datos fiscales pendientes');
    await expect(doc).toContainText(data.fullName);
    await expect(doc).toContainText(`${await demoNationalIdLabel(page.request)} ******${data.docNumber.slice(-4)}`);
    await expect(doc).not.toContainText(data.docNumber);
    await expect(doc).toContainText(figure(first.amount));
    await expect(doc).toContainText('Recibió');
    await expect(doc).toContainText('Paola Martínez Ruiz');
    await expect(doc).toContainText('Este documento no es factura');
    if (viewport.width === 390) {
      await expectDialogInsideViewport(page, dialog);
      await expectNoHorizontalScroll(page);
    }

    // Enviar por email: la API lo encola y avisa del destino enmascarado.
    await dialog.getByRole('button', { name: 'Enviar por email' }).click();
    await expect(page.getByText(/Recibo enviado a re\*\*\*@example\.com\./)).toBeVisible({ timeout: 10_000 });

    // Imprimir A4: vista imprimible en otra pestaña.
    const [a4] = await Promise.all([
      context.waitForEvent('page'),
      dialog.getByRole('link', { name: /Imprimir A4/ }).click(),
    ]);
    await a4.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(a4).toHaveURL(new RegExp(`/print/payments/${first.id}/receipt$`));
    const a4Doc = a4.getByTestId('receipt-document');
    await expect(a4Doc).toContainText(`N.º ${first.receiptNumber}`, { timeout: 15_000 });
    if (viewport.width === 390) await expectNoHorizontalScroll(a4);
    const toolbar = a4.getByRole('toolbar', { name: 'Acciones del recibo' });
    await expect(toolbar).toBeVisible();
    await a4.emulateMedia({ media: 'print' });
    await expect(toolbar).toBeHidden();
    await expect(a4Doc).toBeVisible();
    if (viewport.width === 1440) {
      const pdf = await a4.pdf({ preferCSSPageSize: true });
      expect(pdfPageCount(pdf)).toBe(1);
      expect(Math.round(pdfPageWidth(pdf))).toBe(595); // A4: 210 mm
    }
    await a4.emulateMedia({ media: 'screen' });

    // Tirilla de 80 mm desde la misma barra.
    await toolbar.getByRole('link', { name: 'Tirilla 80 mm' }).click();
    await expect(a4).toHaveURL(new RegExp(`/print/payments/${first.id}/receipt\\?formato=80mm$`));
    const roll = a4.getByTestId('receipt-document');
    await expect(roll).toHaveAttribute('data-format', '80mm', { timeout: 15_000 });
    await expect(roll).toContainText(`N.º ${first.receiptNumber}`);
    if (viewport.width === 390) await expectNoHorizontalScroll(a4);
    if (viewport.width === 1440) {
      await a4.emulateMedia({ media: 'print' });
      const pdf = await a4.pdf({ preferCSSPageSize: true });
      expect(Math.round(pdfPageWidth(pdf))).toBe(227); // 80 mm
    }
    await a4.close();
  });
}

test('un abono anulado conserva su número y su recibo sale ANULADO con motivo y fecha, en pantalla y al imprimir', async ({
  page,
  context,
}) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const data = await seed(page.request, host, `${suffix}void`, [61_000]);
  const [payment] = data.payments;
  const admin = { 'X-Tenant-Host': host, Authorization: `Bearer ${await apiLogin(page.request, host, ADMIN_EMAIL)}` };
  const voided = await page.request.delete(`${API_URL}/payments/${payment.id}`, {
    headers: admin,
    data: { reason: 'Cobro duplicado en caja' },
  });
  expect(voided.ok(), await voided.text()).toBeTruthy();

  await context.addInitScript(() => {
    window.print = () => undefined;
  });
  await webLogin(page, origin, RECEPTION_EMAIL);
  const dialog = await openReceiptFromStatement(page, origin, data.patientId, payment.amount);
  await expect(dialog.getByTestId('receipt-document')).toContainText(`N.º ${payment.receiptNumber}`);
  const stamp = dialog.getByTestId('receipt-voided');
  await expect(stamp).toContainText('ANULADO');
  await expect(stamp).toContainText('Cobro duplicado en caja');
  await expect(stamp).toContainText(/Anulado el \d{2}\/\d{2}\/\d{4}/);

  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    dialog.getByRole('link', { name: /Imprimir A4/ }).click(),
  ]);
  await printPage.emulateMedia({ media: 'print' });
  const printedStamp = printPage.getByTestId('receipt-voided');
  await expect(printedStamp).toBeVisible({ timeout: 15_000 });
  await expect(printedStamp).toContainText('Cobro duplicado en caja');
  await expect(printPage.getByTestId('receipt-document')).toContainText(`N.º ${payment.receiptNumber}`);
  await printPage.close();
});

test('un rol sin permiso de cobro recibe 403 en español y la vista imprimible lo dice', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const data = await seed(page.request, host, `${suffix}403`, [10_000]);
  const dentist = { 'X-Tenant-Host': host, Authorization: `Bearer ${await apiLogin(page.request, host, DENTIST_EMAIL)}` };
  const res = await page.request.get(`${API_URL}/payments/${data.payments[0].id}/receipt`, { headers: dentist });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { message: string }).message).toBe(
    'Tu rol no tiene acceso a los recibos de caja: los ven, imprimen y envían administración y recepción.',
  );

  await webLogin(page, origin, DENTIST_EMAIL);
  await page.goto(`${origin}/print/payments/${data.payments[0].id}/receipt`);
  await expect(page.getByText('Tu rol no tiene acceso a los recibos de caja.')).toBeVisible({ timeout: 15_000 });
});

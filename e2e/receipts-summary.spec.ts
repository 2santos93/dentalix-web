import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { DEMO_CURRENCY, DEMO_REGION } from './support/demo';
import { sedeDate } from './support/clock';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e (DX-401): recibo resumen de un periodo por paciente.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - la administradora crea por la API un paciente (con email) y un plan en la
 *     moneda de la sede principal; recepción registra dos abonos por la API;
 *   - recepción abre «Resumen de recibos» desde el estado de cuenta: el periodo
 *     por defecto (este mes de la sede) trae los dos recibos y el total;
 *   - se anula uno: sale «Anulado» con su motivo y fuera del total;
 *   - lo envía por email (destino enmascarado) y lo imprime: la vista
 *     imprimible lleva el periodo en la URL y pinta los mismos números;
 *   - un rol sin permiso de cobro no ve el botón y la API le responde 403.
 * En escritorio (1440px) y en móvil (390px, sin scroll horizontal ni en el
 * diálogo ni en la vista imprimible).
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

// El formato de la sede principal (DX-378), con los dos decimales del USD: solo la cifra.
const sedeFormat = regionalFormat(DEMO_REGION);
function figure(amount: number): string {
  return sedeFormat.number(amount, { min: 2, max: 2 });
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
  const patient = await post<{ id: string }>(admin, '/patients', {
    firstName: 'Mariana',
    lastName: `Resumen${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `20${Date.now().toString().slice(-8)}`,
    sex: 'F',
    email: `resumen-${tag}@example.com`,
  });
  const plan = await post<{ id: string }>(admin, `/patients/${patient.id}/treatment-plans`, {
    currency: DEMO_CURRENCY,
  });
  const payments: Seeded['payments'] = [];
  for (const amount of amounts) {
    const payment = await post<{ id: string; receiptNumber: string }>(
      reception,
      `/treatment-plans/${plan.id}/payments`,
      { amount, currency: DEMO_CURRENCY, paidAt: new Date().toISOString(), method: 'CASH' },
    );
    payments.push({ id: payment.id, receiptNumber: payment.receiptNumber, amount });
  }
  return { patientId: patient.id, payments };
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

/** Abre el estado de cuenta del paciente y el diálogo «Resumen de recibos» con su vista previa. */
async function openSummary(page: Page, origin: string, patientId: string) {
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const panel = page.locator('#tabpanel-account-statement');
  await panel.getByRole('button', { name: 'Resumen de recibos' }).click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Resumen de recibos' });
  await expect(dialog.getByTestId('receipts-summary-preview')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción ve el resumen del mes, el anulado fuera del total, lo envía y lo imprime (${viewport.name})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const data = await seed(page.request, host, `${suffix}${viewport.width}`, [125, 80]);
    const [first, second] = data.payments;

    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await webLogin(page, origin, RECEPTION_EMAIL);

    // Periodo por defecto (este mes de la sede): los dos recibos y su total.
    let dialog = await openSummary(page, origin, data.patientId);
    const rows = dialog.getByTestId('receipts-summary-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: first.receiptNumber })).toContainText(figure(first.amount));
    await expect(rows.filter({ hasText: second.receiptNumber })).toContainText(figure(second.amount));
    await expect(dialog.getByTestId(`receipts-summary-total-${DEMO_CURRENCY}`)).toContainText(
      figure(first.amount + second.amount),
    );
    await expect(dialog.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true');
    if (viewport.width === 390) {
      await expectDialogInsideViewport(page, dialog);
      await expectNoHorizontalScroll(page);
      const { scrollWidth, clientWidth } = await dialog.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth, 'scroll horizontal del diálogo').toBeLessThanOrEqual(clientWidth);
    }
    await page.keyboard.press('Escape');

    // Se anula el segundo: sigue en la lista, marcado y con su motivo, pero fuera del total.
    const admin = { 'X-Tenant-Host': host, Authorization: `Bearer ${await apiLogin(page.request, host, ADMIN_EMAIL)}` };
    const voided = await page.request.delete(`${API_URL}/payments/${second.id}`, {
      headers: admin,
      data: { reason: 'Cobro duplicado en caja' },
    });
    expect(voided.ok(), await voided.text()).toBeTruthy();

    dialog = await openSummary(page, origin, data.patientId);
    const voidedRow = dialog.getByTestId('receipts-summary-row').filter({ hasText: second.receiptNumber });
    await expect(voidedRow).toHaveAttribute('data-voided', 'true');
    await expect(voidedRow).toContainText('Anulado');
    await expect(voidedRow).toContainText('Cobro duplicado en caja');
    await expect(dialog.getByTestId(`receipts-summary-total-${DEMO_CURRENCY}`)).toContainText(figure(first.amount));
    await expect(dialog.getByTestId(`receipts-summary-total-${DEMO_CURRENCY}`)).not.toContainText(
      figure(first.amount + second.amount),
    );
    await expect(dialog).toContainText('1 recibo anulado: no cuenta en el total.');

    // Enviar por email: la API lo encola y avisa del destino enmascarado.
    await dialog.getByRole('button', { name: 'Enviar por email' }).click();
    await expect(dialog.getByTestId('receipts-summary-sent')).toContainText(/Enviado a .+@example\.com\./, {
      timeout: 10_000,
    });

    // Imprimir: vista imprimible en otra pestaña, con el periodo en la URL.
    const [printPage] = await Promise.all([
      context.waitForEvent('page'),
      dialog.getByRole('link', { name: /Imprimir/ }).click(),
    ]);
    await printPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(printPage).toHaveURL(
      new RegExp(`/print/patients/${data.patientId}/receipts-summary\\?from=\\d{4}-\\d{2}-\\d{2}&to=\\d{4}-\\d{2}-\\d{2}$`),
    );
    const doc = printPage.getByTestId('receipts-summary-document');
    await expect(doc).toContainText(first.receiptNumber, { timeout: 15_000 });
    await expect(doc).toContainText(second.receiptNumber);
    await expect(doc).toContainText('Cobro duplicado en caja');
    await expect(doc.getByRole('table', { name: 'Totales por moneda' })).toContainText(figure(first.amount));
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(printPage);
      const { scrollWidth, clientWidth } = await doc.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth, 'scroll horizontal del documento').toBeLessThanOrEqual(clientWidth);
    }
    const toolbar = printPage.getByRole('toolbar', { name: 'Acciones del documento' });
    await expect(toolbar).toBeVisible();
    await printPage.emulateMedia({ media: 'print' });
    await expect(toolbar).toBeHidden();
    await expect(doc).toBeVisible();
    await printPage.close();
  });
}

test('un rol sin permiso de cobro no ve «Resumen de recibos» y la API le responde 403', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const data = await seed(page.request, host, `${suffix}403`, [10]);
  const dentist = { 'X-Tenant-Host': host, Authorization: `Bearer ${await apiLogin(page.request, host, DENTIST_EMAIL)}` };
  // El periodo con días de la sede (el 403 llega antes de mirar el periodo, pero que sea válido).
  const today = sedeDate(new Date(), DEMO_REGION.timeZone);
  const monthStart = `${today.slice(0, 8)}01`;
  const res = await page.request.get(
    `${API_URL}/patients/${data.patientId}/payment-receipts/summary?from=${monthStart}&to=${today}`,
    { headers: dentist },
  );
  expect(res.status()).toBe(403);

  await webLogin(page, origin, DENTIST_EMAIL);
  await page.goto(`${origin}/print/patients/${data.patientId}/receipts-summary?from=${monthStart}&to=${today}`);
  await expect(page.getByText('Tu rol no tiene acceso a los recibos de caja.')).toBeVisible({ timeout: 15_000 });
});

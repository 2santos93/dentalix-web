import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { openPatientTab } from './support/patient-tabs';
import { expectNoHorizontalScroll } from './support/layout';
import { expectTouchTarget } from './support/touch-targets';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-432): historial «Traspasos y devoluciones», reimpresión, tope de
 * recepción en Ajustes › Caja y recepción con el tope en 0, a 1440 y 390 px.
 * Ejemplos en USD (la sede de e2e). Requiere los dos servidores.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const admin = { fullName: 'Ada Admin', email: `ada.sf432.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.sf432.${suffix}@example.com` };
const money = (amount: number) => moneyWithCode(amount, 'USD', regionalFormat(E2E_REGION));
const CAP_LABEL = 'Tope de recepción por día (en cada moneda)';

let session: ApiSession;
let patientId = '';
const origin = tenantOrigin(`test-clinic-sf432-${suffix}`);

async function seed(request: APIRequestContext) {
  async function plan(price: number, code: string): Promise<string> {
    const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `${code}-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Corona ${code}`,
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
    return created.id;
  }
  const origen = await plan(500, 'o');
  await plan(400, 'd');
  const payment = await apiPost<{ id: string }>(request, session, `/treatment-plans/${origen}/payments`, {
    amount: 300,
    currency: 'USD',
    paidAt: '2026-09-01',
    method: 'TRANSFER',
  });
  const cancel = await request.patch(`${API_URL}/treatment-plans/${origen}`, {
    headers: session.headers,
    data: { status: 'CANCELLED' },
  });
  expect(cancel.ok()).toBeTruthy();
  // Una devolución hecha por la API: el historial y el abono de referencia ya existen.
  await apiPost(request, session, `/treatment-plans/${origen}/credit-refunds`, {
    amount: 40,
    currency: 'USD',
    method: 'TRANSFER',
    reason: 'El paciente se muda de ciudad',
    paymentIds: [payment.id],
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain: `test-clinic-sf432-${suffix}`,
    clinicName: `Clinica Saldo 432 ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Ana',
      lastName: `Historial${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `H${suffix}`,
      sex: 'F',
    })
  ).id;
  await seed(request);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`historial, reimpresión y «Anular» explicado (${viewport.width} px)`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${patientId}`);
    await openPatientTab(page, 'Estado de cuenta');
    const panel = page.locator('#tabpanel-account-statement');
    const history = panel.getByTestId('credit-movements');
    await expect(history.getByRole('heading', { name: 'Traspasos y devoluciones' })).toBeVisible({ timeout: 10_000 });
    const row = history.getByRole('row').filter({ hasText: 'DEV-' });
    await expect(row).toContainText(money(40));
    await expect(row).toContainText('El paciente se muda de ciudad');
    await expectNoHorizontalScroll(page);

    // Reimprimir: el comprobante vuelve a abrirse y el foco regresa a la fila.
    const trigger = row.getByRole('button', { name: /^Acciones de/ });
    if (viewport.width === 390) await expectTouchTarget(trigger, { width: true, label: '«⋯» del historial' });
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Reimprimir comprobante' }).click();
    const receipt = page.getByRole('dialog', { name: 'Comprobante de devolución' });
    await expect(receipt.getByTestId('refund-document')).toContainText(/DEV-[A-Z0-9]+-000001/);
    await expectNoHorizontalScroll(page);
    await receipt.getByRole('button', { name: 'Cerrar' }).first().click();
    await expect(receipt).toBeHidden();

    // El abono de referencia de la devolución no se anula: «Anular» deshabilitado y explicado.
    const movements = panel.getByRole('table', { name: /movimientos/i });
    await movements.getByRole('button', { name: /^Acciones de abono/ }).first().click();
    const anular = page.getByRole('menuitem', { name: /Anular/ });
    await expect(anular).toHaveAttribute('aria-disabled', 'true');
    await expect(anular).toContainText('es referencia de la devolución DEV-');
    await page.keyboard.press('Escape');
  });
}

test('el administrador cambia el tope en Ajustes › Caja y recepción con tope 0 ve las acciones deshabilitadas', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/caja`);
  const cap = page.getByLabel(CAP_LABEL);
  await expect(cap).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('0 = recepción no puede traspasar ni devolver; el administrador siempre puede.')).toBeVisible();
  await expect(cap).toHaveValue('0');
  await cap.fill('25');
  await page.getByRole('button', { name: 'Guardar el tope de recepción' }).click();
  await expect(page.getByText('Tope de recepción guardado.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await cap.fill('0');
  await page.getByRole('button', { name: 'Guardar el tope de recepción' }).click();
  await expect(page.getByText('Tope de recepción guardado.')).toBeVisible();

  // Recepción con el tope en 0: la sección no deja mover saldo y dice por qué.
  await page.context().clearCookies();
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  await openPatientTab(page, 'Estado de cuenta');
  const credit = page.locator('#tabpanel-account-statement').getByTestId('credit-balance');
  await credit.getByRole('button', { name: /^Acciones de/ }).click();
  const devolver = page.getByRole('menuitem', { name: /Devolver/ });
  await expect(devolver).toHaveAttribute('aria-disabled', 'true');
  await expect(devolver).toContainText('Recepción no puede traspasar ni devolver saldo a favor');
});

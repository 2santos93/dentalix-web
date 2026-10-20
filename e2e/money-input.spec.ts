import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import type { APIRequestContext } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-241 · Importes bien leídos: recepción registra un compromiso de
 * «150,50» USD y un abono de «150.000» COP, ve «Se guardará: …» bajo cada
 * campo antes de guardar, y el importe correcto (no ×100) sale en la Cartera
 * y en la ficha. A 1440 px en claro y a 390 px en oscuro.
 *
 * Una clínica nueva por corrida con un deudor por viewport (cada paciente
 * admite un solo compromiso abierto): dos planes vencidos, uno de 400 USD y
 * otro de 400.000 COP, en cuotas desde hace más de un año.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `importes-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.imp.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.imp.${suffix}@example.com` };

const viewports = [
  { width: 1440, height: 900, scheme: 'light' as const, firstName: 'Irene', tag: 'a' },
  { width: 390, height: 844, scheme: 'dark' as const, firstName: 'Ivan', tag: 'b' },
];

let session: ApiSession;
const patients: Record<string, { id: string; fullName: string }> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Importes ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  for (const v of viewports) {
    const lastName = `Importe${v.tag}${suffix}`.slice(0, 30);
    const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: v.firstName,
      lastName,
      docType: 'CC',
      docNumber: `IM${v.tag}${suffix}`.slice(0, 20),
      sex: 'F',
      phone: '300 555 0188',
      countryCode: 'CO',
    });
    await seedOverduePlan(request, id, { currency: 'USD', price: 400, tag: `${v.tag}u` });
    await seedOverduePlan(request, id, { currency: 'COP', price: 400000, tag: `${v.tag}c` });
    patients[v.tag] = { id, fullName: `${v.firstName} ${lastName}` };
  }
});

/** Un plan aceptado en `currency`, en dos cuotas mensuales desde hace 400 días. */
async function seedOverduePlan(
  request: APIRequestContext,
  patientId: string,
  p: { currency: string; price: number; tag: string },
): Promise<void> {
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `imp-${p.tag}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Corona ${p.tag} ${suffix.slice(0, 6)}`,
    color: '#3366CC',
    defaultPrice: p.price,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
    currency: p.currency,
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  await apiPost<object>(request, session, `/treatment-plans/${plan.id}/payment-plan`, {
    installmentsCount: 2,
    periodicity: 'MONTHLY',
    startDate: `${sedeDayFromToday(-400)}T00:00:00.000Z`,
  });
}

/** El fila (escritorio) o la tarjeta (móvil) del deudor en la Cartera. */
function debtorIn(page: Page, width: number, fullName: string) {
  return width >= 640
    ? page.getByRole('row', { name: new RegExp(fullName) })
    : page.getByRole('article', { name: fullName });
}

/** Normaliza los espacios duros de Intl para comparar importes. */
const money = (text: string) => new RegExp(text.replace(/\./g, '\\.').replace(/ /g, '\\s').replace(/\$/g, '\\$'));

for (const v of viewports) {
  test(`compromiso 150,50 USD y abono 150.000 COP con el importe correcto en Cartera y ficha (${v.width} px, ${v.scheme})`, async ({
    page,
  }) => {
    const patient = patients[v.tag];
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.emulateMedia({ colorScheme: v.scheme });
    await loginAs(page, origin, reception.email, password);
    await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));

    // Cartera → «Compromiso de pago»: «150,50» en USD.
    await page.goto(`${origin}/caja/cartera`);
    await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible({ timeout: 15_000 });
    const debtor = debtorIn(page, v.width, patient.fullName);
    await expect(debtor).toBeVisible({ timeout: 15_000 });
    await debtor.getByRole('button', { name: `Compromiso de pago de ${patient.fullName}` }).click();
    const promise = page.getByRole('dialog', { name: 'Compromiso de pago' });
    await expectDialogInsideViewport(page, promise);
    await promise.getByLabel('Moneda').selectOption('USD');
    // Lo ambiguo no se envía: el motivo sale junto al campo.
    await promise.getByLabel('Importe').fill('1.50.0');
    await promise.getByLabel('Pagará hasta el').fill(sedeDayFromToday(7));
    await promise.getByRole('button', { name: 'Guardar compromiso' }).click();
    await expect(promise.getByText(/No sabemos leer «1\.50\.0»/)).toBeVisible();
    await expect(promise.getByLabel('Importe')).toHaveAttribute('aria-invalid', 'true');
    await promise.getByLabel('Importe').fill('150,50');
    await expect(promise.getByText(money('Se guardará: 150,50 US$'))).toBeVisible();
    await promise.getByRole('button', { name: 'Guardar compromiso' }).click();
    await expect(promise).toBeHidden({ timeout: 10_000 });
    const status = debtor.getByTestId('promise-status');
    await expect(status.getByText('Abierto')).toBeVisible({ timeout: 15_000 });
    await expect(status).toContainText(money('150,50 US$'));
    await expectNoHorizontalScroll(page);

    // Ficha → «Registrar abono» de «150.000» al plan en COP.
    await page.goto(`${origin}/patients/${patient.id}?tab=account-statement`);
    const block = page.getByTestId('patient-collections');
    await expect(block.getByTestId('promise-row')).toContainText(money('150,50 US$'), { timeout: 15_000 });
    const panel = page.locator('#tabpanel-account-statement');
    await panel.getByRole('button', { name: 'Registrar abono' }).click();
    const payment = page.getByRole('dialog', { name: 'Registrar abono' });
    const plan = payment.getByLabel('Plan');
    await expect(plan).toBeVisible({ timeout: 10_000 });
    const copPlan = await plan.locator('option', { hasText: 'COP' }).getAttribute('value');
    await plan.selectOption(copPlan!);
    await expect(payment.getByLabel('Moneda')).toHaveValue('COP');
    await expectDialogInsideViewport(page, payment);
    await payment.getByLabel('Importe').fill('150.000');
    await expect(payment.getByText(money('Se guardará: 150.000,00 COP'))).toBeVisible();
    await payment.getByLabel('Método').selectOption('CASH');
    await payment.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(payment).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByRole('button', { name: /^Anular abono de 150\.000,00\sCOP/ })).toBeVisible({
      timeout: 15_000,
    });
    // El compromiso en USD sigue abierto: el abono fue en otra moneda.
    await expect(block.getByTestId('promise-row').getByText('Abierto')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Cartera: el saldo en COP bajó 150.000 (no 150), y el compromiso sigue en 150,50 US$.
    await page.goto(`${origin}/caja/cartera`);
    const after = debtorIn(page, v.width, patient.fullName);
    await expect(after).toContainText(money('250.000,00 COP'), { timeout: 15_000 });
    await expect(after.getByTestId('promise-status')).toContainText(money('150,50 US$'));
    await expectNoHorizontalScroll(page);
  });
}

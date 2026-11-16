import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ, lastSlotToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { E2E_TODAY_REGION } from './support/regional';

/**
 * e2e DX-202-bis: la salida del paciente resuelve cada punto sin ir a la ficha.
 *
 * Una clínica nueva por corrida (USD, una sede sin horario), recepción y una
 * asistente sin PAYMENT_REGISTER. Cada paciente llega sin teléfono ni correo y
 * con un plan en USD de 120 aceptado (saldo pendiente, nada vencido); su cita
 * de hoy queda «Lista para cobrar» por la API. En serie:
 * 1. 1440 px y 2. 390 px: recepción abre la salida desde «En clínica», ve el
 *    saldo pendiente hoy, cobra en el mismo diálogo (el modal de registrar
 *    abono), completa el teléfono en línea y completa la cita con el correo
 *    pendiente;
 * 3. la asistente sin permiso de cobro abre la salida y no ve el cobro ni
 *    «Cobrar».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `salida-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Sara Titular', email: `sara.sal.${suffix}@example.com` };
const dentist = { fullName: 'Lina Salida', email: `lina.sal.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.sal.${suffix}@example.com` };
const assistant = { fullName: 'Ada Asistente', email: `ada.sal.${suffix}@example.com` };
const last = `Salida${suffix}`.slice(0, 40);

test.use({ timezoneId: SEDE_TODAY_TZ });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;

async function patch(request: APIRequestContext, path: string, data: object) {
  const res = await request.patch(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

/** Paciente sin contacto, con 120 USD aceptados y su cita de hoy lista para cobrar. */
async function readyPatient(request: APIRequestContext, firstName: string, providerId: string, i: number) {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: last,
    docType: 'NATIONAL_ID',
    docNumber: `SAL${i}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `sal-${i}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Limpieza ${i}`,
    color: '#3366CC',
    defaultPrice: 120,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  await patch(request, `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  // Franjas distintas: dos citas de la misma odontóloga no se solapan.
  const slot = lastSlotToday(`23:${String(20 + i * 10).padStart(2, '0')}`, `23:${String(25 + i * 10)}`, SEDE_TODAY_TZ);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    reason: 'Limpieza',
  });
  for (const status of ['ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT']) {
    await patch(request, `/appointments/${appointment.id}`, { status });
  }
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Salida ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...assistant, role: 'ASSISTANT', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const lina = members.find((m) => m.fullName === dentist.fullName)!.userId;
  for (const [i, name] of ['Ana', 'Berta', 'Carla'].entries()) {
    await readyPatient(request, name, lina, i);
  }
});

async function openCheckout(page: Page, firstName: string) {
  await page.goto(`${origin}/agenda/en-clinica`);
  const ready = page.getByTestId('in-clinic-group-readyForCheckout');
  await ready
    .getByTestId('in-clinic-item')
    .filter({ hasText: `${firstName} ${last}` })
    .getByRole('button', { name: 'Completar' })
    .click();
  const checkout = page.getByRole('dialog', { name: `Salida de ${firstName} ${last}` });
  await expect(checkout.getByTestId('checkout-PHONE')).toHaveAttribute('data-done', 'false', { timeout: 15_000 });
  return checkout;
}

async function chargeAndComplete(page: Page, firstName: string, phone: string) {
  await loginAs(page, origin, reception.email, password);
  const checkout = await openCheckout(page, firstName);

  // El saldo pendiente hoy, aunque nada esté vencido.
  const payment = checkout.getByTestId('checkout-PAYMENT');
  await expect(payment).toHaveAttribute('data-done', 'false');
  await expect(payment).toContainText('Tiene saldo pendiente hoy');
  await expect(checkout.getByTestId('checkout-PAYMENT-detail')).toContainText(/Pendiente hoy: .*120/);
  await expectNoHorizontalScroll(page);

  // Cobrar en el mismo diálogo: el modal de registrar abono del estado de cuenta.
  await payment.getByRole('button', { name: 'Cobrar' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(pay.getByLabel('Plan').locator('option:checked')).toContainText(/120/, { timeout: 15_000 });
  await pay.getByLabel('Importe').fill('120');
  await pay.getByLabel('Método').selectOption({ label: 'Efectivo' });
  await expectNoHorizontalScroll(page);
  await pay.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(pay).toBeHidden({ timeout: 15_000 });
  await expect(checkout).toBeVisible();
  await expect(payment).toHaveAttribute('data-done', 'true', { timeout: 15_000 });
  await expect(payment).toContainText('Sin saldo pendiente');

  // El teléfono, en línea, sin ir a la ficha.
  const phoneRow = checkout.getByTestId('checkout-PHONE');
  await phoneRow.getByRole('button', { name: 'Añadir teléfono' }).click();
  await phoneRow.getByLabel('Teléfono del paciente').fill(phone);
  await phoneRow.getByRole('button', { name: 'Guardar' }).click();
  await expect(phoneRow).toHaveAttribute('data-done', 'true', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);

  // Queda el correo: se completa igual y lo pendiente va a la auditoría.
  await checkout.getByRole('button', { name: 'Completar con 2 pendientes' }).click();
  await expect(checkout).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(`Cita de ${firstName} ${last} completada.`)).toBeVisible();
}

test('1440 px: recepción cobra y completa el teléfono dentro de la salida', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await chargeAndComplete(page, 'Ana', '+58 412 555 0101');
});

test('390 px: recepción cobra y completa el teléfono dentro de la salida', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await chargeAndComplete(page, 'Berta', '+58 414 555 0202');
});

for (const width of [1440, 390]) {
  test(`${width} px: la asistente sin permiso de cobro no ve el cobro ni «Cobrar»`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, assistant.email, password);
    const checkout = await openCheckout(page, 'Carla');
    await expect(checkout.getByTestId('checkout-EMAIL')).toBeVisible();
    await expect(checkout.getByTestId('checkout-PAYMENT')).toHaveCount(0);
    await expect(checkout.getByRole('button', { name: 'Cobrar' })).toHaveCount(0);
    // Completar el contacto sí puede.
    await expect(checkout.getByRole('button', { name: 'Añadir correo' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

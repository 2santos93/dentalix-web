import { randomUUID } from 'node:crypto';
import { fillDate } from './support/dates';
import { test, expect, type Page } from './support/test';
import type { APIRequestContext } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-150 · Cobranza: recepción registra una gestión y un compromiso de
 * pago desde la Cartera (1440 y 390 px), los ve en el bloque «Cobranza» de la
 * ficha, y el chip «Saldo vencido» sale en la tarjeta de la cita y en la
 * cabecera de la ficha: con importe para recepción, solo la marca para el
 * odontólogo.
 *
 * Una clínica nueva por corrida con dos deudores cuyos planes de cuotas
 * vencieron hace más de un año (uno por viewport, porque cada paciente admite
 * un solo compromiso abierto) y una cita del primero mañana, en una sede sin
 * restricción de horario. El abono por el importe del compromiso lo da por
 * cumplido en la ficha y en la Cartera; anularlo lo vuelve a abrir (DX-215).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `cobranza-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.cob.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.cob.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sillón', email: `luis.cob.${suffix}@example.com` };
const lastName = `Cobro${suffix}`.slice(0, 30);
const fullName = `Debora ${lastName}`;
const mobileLastName = `Movil${suffix}`.slice(0, 30);
const mobileFullName = `Mateo ${mobileLastName}`;
const day = sedeDayFromToday(1);

let session: ApiSession;
let patientId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cobranza ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();

  patientId = await seedDebtor(request, { firstName: 'Debora', lastName, doc: `CB${suffix}`, tag: 'a' });
  await seedDebtor(request, { firstName: 'Mateo', lastName: mobileLastName, doc: `MV${suffix}`, tag: 'b' });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const dentistId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId: dentistId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '11:00').toISOString(),
  });
});

/**
 * Un paciente con un plan de 400.000 COP en dos cuotas mensuales desde hace
 * 400 días: saldo vencido de más de 90 días.
 */
async function seedDebtor(
  request: APIRequestContext,
  p: { firstName: string; lastName: string; doc: string; tag: string },
): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: p.firstName,
    lastName: p.lastName,
    docType: 'NATIONAL_ID',
    docNumber: p.doc.slice(0, 20),
    sex: 'F',
    phone: '300 555 0177',
    countryCode: 'CO',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `cobro-${p.tag}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Corona ${p.tag} ${suffix.slice(0, 6)}`,
    color: '#3366CC',
    defaultPrice: 400000,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${id}/treatment-plans`, {
    currency: 'COP',
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
  return id;
}

async function openCartera(page: Page): Promise<void> {
  await loginAs(page, origin, reception.email, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja/cartera`);
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible({ timeout: 15_000 });
}

test('recepción registra una gestión y un compromiso desde la Cartera (1440 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCartera(page);
  const row = page.getByRole('row', { name: new RegExp(fullName) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Sin gestiones')).toBeVisible();

  // «Registrar gestión»: validación en español, aviso de datos clínicos.
  await row.getByRole('button', { name: `Registrar gestión de cobro con ${fullName}` }).click();
  const noteDialog = page.getByRole('dialog', { name: 'Registrar gestión' });
  await expect(noteDialog.getByText(/No escribas datos clínicos/)).toBeVisible();
  await noteDialog.getByRole('button', { name: 'Guardar gestión' }).click();
  await expect(noteDialog.getByText('Elige el canal de la gestión.')).toBeVisible();
  await noteDialog.getByLabel('Canal').selectOption('CALL');
  await noteDialog.getByLabel('Resultado').selectOption('PROMISED_PAYMENT');
  await noteDialog.getByLabel('Nota (opcional)').fill('Paga la próxima semana');
  await noteDialog.getByRole('button', { name: 'Guardar gestión' }).click();
  await expect(noteDialog).toBeHidden();
  await expect(page.getByText(`Gestión registrada para ${fullName}.`)).toBeVisible();
  await expect(row.getByText('Llamada · Promete pago')).toBeVisible({ timeout: 15_000 });

  // «Compromiso de pago».
  await row.getByRole('button', { name: `Compromiso de pago de ${fullName}` }).click();
  const promiseDialog = page.getByRole('dialog', { name: 'Compromiso de pago' });
  await promiseDialog.getByLabel('Importe').fill('200000');
  await promiseDialog.getByLabel('Pagará hasta el').fill(sedeDayFromToday(7));
  await promiseDialog.getByRole('button', { name: 'Guardar compromiso' }).click();
  await expect(promiseDialog).toBeHidden();
  await expect(row.getByTestId('promise-status').getByText('Abierto')).toBeVisible({ timeout: 15_000 });
  // Con uno abierto, no se ofrece otro.
  await expect(row.getByRole('button', { name: `Compromiso de pago de ${fullName}` })).toHaveCount(0);

  // Filtro «Con compromiso abierto».
  await page.getByRole('combobox', { name: 'Compromiso' }).selectOption({ label: 'Con compromiso abierto' });
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a 390 px la gestión y el compromiso se registran desde la tarjeta, con los modales dentro de la pantalla', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCartera(page);
  const card = page.getByRole('article', { name: mobileFullName });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: `Registrar gestión de cobro con ${mobileFullName}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar gestión' });
  await expectDialogInsideViewport(page, dialog);
  await expect(dialog.getByText(/No escribas datos clínicos/)).toBeVisible();
  await dialog.getByLabel('Canal').selectOption('WHATSAPP_LINK');
  await dialog.getByLabel('Resultado').selectOption('NO_ANSWER');
  // Más de 280 caracteres: no se envía y lo dice en español.
  await dialog.getByLabel('Nota (opcional)').fill('x'.repeat(281));
  await dialog.getByRole('button', { name: 'Guardar gestión' }).click();
  await expect(dialog.getByText('La nota admite hasta 280 caracteres.')).toBeVisible();
  await dialog.getByLabel('Nota (opcional)').fill('');
  await dialog.getByRole('button', { name: 'Guardar gestión' }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByText('WhatsApp · No contesta')).toBeVisible({ timeout: 15_000 });

  await card.getByRole('button', { name: `Compromiso de pago de ${mobileFullName}` }).click();
  const promiseDialog = page.getByRole('dialog', { name: 'Compromiso de pago' });
  await expectDialogInsideViewport(page, promiseDialog);
  await promiseDialog.getByRole('button', { name: 'Guardar compromiso' }).click();
  await expect(promiseDialog.getByText('Escribe un importe mayor que 0.')).toBeVisible();
  await promiseDialog.getByLabel('Importe').fill('150000');
  await promiseDialog.getByLabel('Pagará hasta el').fill(sedeDayFromToday(10));
  await promiseDialog.getByRole('button', { name: 'Guardar compromiso' }).click();
  await expect(promiseDialog).toBeHidden();
  await expect(card.getByTestId('promise-status').getByText('Abierto')).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('button', { name: `Compromiso de pago de ${mobileFullName}` })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('la ficha muestra el bloque «Cobranza» y el chip con importe para recepción', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const chip = page.getByTestId('overdue-chip').first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toContainText(/Saldo vencido · \d+ días · /);
  const block = page.getByTestId('patient-collections');
  await expect(block.getByRole('heading', { name: 'Cobranza' })).toBeVisible();
  await expect(block.getByText('Paga la próxima semana')).toBeVisible();
  await expect(block.getByTestId('promise-row').getByText('Abierto')).toBeVisible();

  // Un abono por el importe del compromiso (200.000) lo da por cumplido, sin
  // recargar la ficha, y la Cartera lo muestra.
  const panel = page.locator('#tabpanel-account-statement');
  await panel.getByRole('button', { name: 'Registrar abono' }).click();
  const payment = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(payment.getByLabel('Plan')).toBeVisible({ timeout: 10_000 });
  await payment.getByLabel('Importe').fill('200000');
  await payment.getByLabel('Método').selectOption('CASH');
  await payment.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(payment).toBeHidden({ timeout: 10_000 });
  await expect(block.getByTestId('promise-row').getByText('Cumplido')).toBeVisible({ timeout: 15_000 });
  await expect(block.getByRole('button', { name: 'Compromiso de pago' })).toBeVisible();

  await page.goto(`${origin}/caja/cartera`);
  const row = page.getByRole('row', { name: new RegExp(fullName) });
  await expect(row.getByTestId('promise-status').getByText('Cumplido')).toBeVisible({ timeout: 15_000 });
});

test('DX-215: anular el abono que cumplió el compromiso lo vuelve a «Abierto» en la ficha y en la Cartera', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const block = page.getByTestId('patient-collections');
  await expect(block.getByTestId('promise-row').getByText('Cumplido')).toBeVisible({ timeout: 15_000 });

  // Recepción anula su abono de hoy desde el estado de cuenta.
  const panel = page.locator('#tabpanel-account-statement');
  await panel.getByRole('button', { name: /^Anular abono de .*200\.000/ }).click();
  const dialog = page.getByRole('dialog', { name: '¿Anular este abono?' });
  await expect(dialog.getByText(/el compromiso vuelve a abierto/)).toBeVisible();
  await dialog.getByLabel('Motivo de la anulación').fill('Cobro duplicado por error');
  await dialog.getByRole('button', { name: 'Anular abono' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const promiseRow = block.getByTestId('promise-row');
  await expect(promiseRow.getByText('Abierto', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(promiseRow.getByText(/se anuló el abono que lo cumplía/)).toBeVisible();
  await expect(block.getByRole('button', { name: 'Compromiso de pago' })).toHaveCount(0);

  await page.goto(`${origin}/caja/cartera`);
  const row = page.getByRole('row', { name: new RegExp(fullName) });
  await expect(row.getByTestId('promise-status').getByText('Abierto', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(row.getByText('Reabierto: se anuló el abono')).toBeVisible();
});

test('agenda: el odontólogo ve «Saldo vencido» sin importe en la tarjeta de la cita (1440 y 390 px)', async ({
  page,
}) => {
  await loginAs(page, origin, dentist.email, password);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    // En el teléfono el Día abre en «Lista»; aquí se prueban las columnas.
    await page.getByRole('button', { name: 'Columnas', exact: true }).click();
    await fillDate(page, 'Fecha', day);
    if (width === 390) {
      // En móvil se ve una columna (la del primer profesional): se elige la suya.
      await page.getByRole('group', { name: 'Profesional visible' }).getByRole('button', { name: dentist.fullName }).click();
    }
    const chip = page.getByTestId('overdue-chip').filter({ visible: true }).first();
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toHaveText(/^Saldo vencido · \d+ días$/);
    await expectNoHorizontalScroll(page);
  }
  // Y en la cabecera de su ficha, también sin importe; sin bloque «Cobranza».
  await page.goto(`${origin}/patients/${patientId}`);
  await expect(page.getByTestId('overdue-chip')).toHaveText(/^Saldo vencido · \d+ días$/, { timeout: 15_000 });
  await expect(page.getByTestId('patient-collections')).toHaveCount(0);
});

test('agenda: recepción ve el importe vencido en el chip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  const chip = page.getByTestId('overdue-chip').first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toContainText(/Saldo vencido · \d+ días · .*\d/);

  // Vista Semana: el chip compacto en la tarjeta de la cita.
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  const weekChip = page.getByTestId('overdue-chip').filter({ visible: true }).first();
  await expect(weekChip).toBeVisible({ timeout: 15_000 });
  await expect(weekChip).toContainText(/Saldo vencido · \d+ días · .*\d/);
});

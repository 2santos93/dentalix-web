import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDate, sedeTime } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { axeInBothThemes } from './support/axe';

/**
 * e2e DX-291 (porción 2 de DX-279): la clínica tiene una política de 24 h con
 * cargo de 50.000 COP. El paciente abre el enlace de confirmación 5 h antes:
 * ve el texto de la política y «Cancelación con menos de 24 h de aviso»; sin
 * marcar la aceptación no puede cancelar; con ella, cancela. El ADMIN abre la
 * cita en la agenda, «Generar cargo» por 40.000 (no deja más de 50.000) y
 * recepción lo cobra desde el estado de cuenta con su recibo consecutivo. A
 * 1440 y a 390 px, sin scroll horizontal; axe (todas las violaciones) en
 * claro y oscuro sobre la página pública (con la marca de la clínica) y el
 * diálogo del cargo.
 *
 * DX-343: tras generar, el foco va al encabezado del panel; un 409 deja el
 * diálogo sin botón y un Enter no reenvía; si el panel no carga, error de
 * sección con «Reintentar»; «Condonar» se confirma con el botón destructivo y
 * devuelve el foco al panel. Con DX343_QA_DIR guarda capturas en claro y
 * oscuro.
 *
 * Una clínica nueva por corrida. En serie.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `cargos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.fee.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.fee.${suffix}@example.com` };
const POLICY_TEXT = 'Si no puedes venir, avísanos con un día de antelación.';

let session: ApiSession;
let providerId: string;
const QA_DIR = process.env.DX343_QA_DIR;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cargos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  providerId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string }[])[0].id;
  await apiPost(request, session, `/locations/${principal}/cancellation-policy`, {
    noticeHours: 24,
    suggestedFee: 50000,
    currency: 'COP',
    patientText: POLICY_TEXT,
  });
});

/** Paciente con una cita dentro de `hours` horas y su enlace de confirmación. */
async function lateAppointment(
  request: Parameters<typeof apiPost>[0],
  lastName: string,
  hours: number,
): Promise<{ patientId: string; start: Date; token: string; appointmentId: string }> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Paula',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: lastName.slice(0, 20),
    sex: 'F',
  });
  const start = new Date(Math.ceil((Date.now() + hours * 3_600_000) / 60_000) * 60_000);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
  const link = await apiPost<{ url: string }>(
    request,
    session,
    `/appointments/${appointment.id}/confirmation-link`,
    {},
  );
  return { patientId: patient.id, start, token: link.url.split('/confirmar/')[1], appointmentId: appointment.id };
}

/**
 * axe en claro y oscuro sobre `scope` y, con DX343_QA_DIR, captura de la
 * página en cada tema.
 */
async function audit(page: Page, scope: Locator, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  const violations = await axeInBothThemes(page, scope, async (colorScheme) => {
    if (!QA_DIR) return;
    mkdirSync(QA_DIR, { recursive: true });
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${colorScheme}.png` });
  });
  expect.soft(violations.light, `${name} ${width} claro`).toEqual([]);
  expect.soft(violations.dark, `${name} ${width} oscuro`).toEqual([]);
}

/** ADMIN: de la agenda del día de `start` al detalle de su cita. */
async function openAppointment(page: Page, start: Date) {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  const listToggle = page.getByRole('button', { name: 'Lista', exact: true });
  if (await listToggle.isVisible()) await listToggle.click();
  await page.getByLabel('Fecha', { exact: true }).fill(sedeDate(start));
  const end = new Date(start.getTime() + 30 * 60_000);
  // A 1440 es la fila de la tabla; a 390, la tarjeta: el botón visible.
  const detail = page
    .getByRole('button', { name: new RegExp(`Detalle de la cita de ${sedeTime(start)}–${sedeTime(end)}`) })
    .locator('visible=true')
    .first();
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await detail.click();
  // El detalle es un diálogo; mientras otro diálogo está encima queda fuera
  // del árbol accesible, así que el panel se busca por su test id.
  return page.getByTestId('cancellation-fee-panel');
}

/** El paciente cancela tarde por su enlace, aceptando la política. */
async function cancelLate(page: Page, token: string) {
  await page.context().clearCookies();
  await page.goto(`${origin}/confirmar/${token}`);
  await page.getByRole('checkbox', { name: /acepto la política de cancelación/ }).check();
  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByText(/Cancelaste la cita/)).toBeVisible({ timeout: 10_000 });
}

const feeHeading = (scope: Locator) =>
  scope.getByRole('heading', { name: 'Cargo por inasistencia o cancelación tardía' });

async function flow(page: Page, request: Parameters<typeof apiPost>[0], width: number, lastName: string) {
  const height = width < 768 ? 844 : 900;
  await page.setViewportSize({ width, height });
  // Horas distintas por test: en la agenda no se confunden las dos citas.
  const { patientId, start, token } = await lateAppointment(request, lastName, width < 768 ? 6 : 5);

  // --- Paciente: enlace público, sin sesión.
  await page.context().clearCookies();
  await page.goto(`${origin}/confirmar/${token}`);
  const policy = page.getByRole('region', { name: 'Política de cancelación' });
  await expect(policy).toBeVisible({ timeout: 15_000 });
  await expect(policy).toContainText('avísanos con al menos 24 h de antelación');
  await expect(policy).toContainText(POLICY_TEXT);
  await expect(policy).toContainText('50.000');
  await expect(policy.getByText('Cancelación con menos de 24 h de aviso')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await audit(page, page.locator('main'), 'pagina-publica');

  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'marca que aceptas la política' })).toBeVisible();
  const box = page.getByRole('checkbox', { name: /acepto la política de cancelación/ });
  await expect(box).toBeFocused();
  await box.check();
  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByText(/Cancelaste la cita/)).toBeVisible({ timeout: 10_000 });

  // --- ADMIN: agenda → detalle → «Generar cargo».
  const panel = await openAppointment(page, start);
  await expect(panel).toContainText('Importe sugerido', { timeout: 15_000 });
  await audit(page, panel, 'panel');
  await panel.getByRole('button', { name: 'Generar cargo' }).click();
  const chargeDialog = page.getByRole('dialog', { name: 'Generar cargo' });
  await expectDialogInsideViewport(page, chargeDialog);
  const amount = chargeDialog.getByLabel('Importe');
  await amount.fill('60.000');
  await chargeDialog.getByRole('button', { name: 'Generar cargo' }).click();
  await expect(chargeDialog.getByText(/no puede superar/)).toBeVisible();
  await amount.fill('40.000');
  await expectNoHorizontalScroll(page);
  await audit(page, chargeDialog, 'dialogo-generar');
  await chargeDialog.getByRole('button', { name: 'Generar cargo' }).click();
  await expect(chargeDialog).toBeHidden({ timeout: 10_000 });
  await expect(panel).toContainText(/Cargo generado: .*40\.000/);
  // DX-343: «Generar cargo» ya no existe; el foco queda en el panel.
  await expect(feeHeading(panel)).toBeFocused();
  await audit(page, panel, 'panel-generado');
  await expectNoHorizontalScroll(page);

  // --- Recepción: lo cobra desde el estado de cuenta, con recibo consecutivo.
  await page.context().clearCookies();
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await expect(statement.getByRole('region', { name: 'Resumen en COP' })).toBeVisible({ timeout: 15_000 });
  await statement.getByRole('button', { name: 'Registrar abono' }).click();
  const payDialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(payDialog.getByLabel('Plan').locator('option:checked')).toContainText('Saldo 40.000', {
    timeout: 10_000,
  });
  await payDialog.getByLabel('Importe').fill('40.000');
  await payDialog.getByLabel('Método').selectOption('CASH');
  await expectNoHorizontalScroll(page);
  await payDialog.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(payDialog).toBeHidden({ timeout: 10_000 });
  await expect(statement.getByRole('region', { name: 'Resumen en COP' }).getByTestId('balance')).toContainText(
    '0',
    { timeout: 10_000 },
  );

  // El abono lleva su recibo consecutivo (DX-136).
  const plans = await request.get(`${API_URL}/patients/${patientId}/billable-plans`, {
    headers: session.headers,
  });
  const planId = ((await plans.json()) as { id: string }[])[0]?.id;
  const payments = await request.get(`${API_URL}/treatment-plans/${planId}/payments`, {
    headers: session.headers,
  });
  expect(((await payments.json()) as { receiptNumber: string }[])[0].receiptNumber).toMatch(/^[A-Z0-9]+-\d{6}$/);
  await page.context().clearCookies();
}

test('1440 px: cancelar tarde por el enlace → generar cargo → cobrarlo', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 1440, `Escritorio${suffix}`.slice(0, 30));
});

test('390 px: el mismo flujo sin scroll horizontal', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 390, `Movil${suffix}`.slice(0, 30));
});

for (const width of [1440, 390]) {
  test(`${width} px: un 409 al generar explica el conflicto, relee el panel y Enter no reenvía (DX-343)`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const { start, token, appointmentId } = await lateAppointment(request, `Choque${width}${suffix}`.slice(0, 30), width < 768 ? 8 : 7);
    await cancelLate(page, token);
    const panel = await openAppointment(page, start);
    await expect(panel).toContainText('Importe sugerido', { timeout: 15_000 });
    await panel.getByRole('button', { name: 'Generar cargo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Generar cargo' });
    await expect(dialog).toBeVisible();

    // Otra persona lo genera mientras el diálogo está abierto.
    const other = await request.post(`${API_URL}/appointments/${appointmentId}/cancellation-fee`, {
      headers: session.headers,
      data: {},
    });
    expect(other.ok(), await other.text()).toBeTruthy();

    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee`)) posts++;
    });
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee`) && r.status() === 409,
    );
    await dialog.getByRole('button', { name: 'Generar cargo' }).click();
    await conflict;
    await expect(dialog.getByRole('status')).toContainText('cambió mientras lo tenías abierto');
    await expect(dialog.getByRole('button', { name: 'Generar cargo' })).toHaveCount(0);
    const amount = dialog.getByLabel('Importe');
    await expect(amount).toBeDisabled();
    // El envío implícito (Enter) no tiene por dónde salir: ni botón ni campo activo.
    await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
    // El panel se relee por debajo: ya dice el cargo que generó la otra persona.
    await expect(panel).toContainText(/Cargo generado: .*50\.000/, { timeout: 10_000 });
    expect(posts).toBe(1);
    await audit(page, dialog, 'dialogo-generar-409');

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(feeHeading(panel)).toBeFocused();
    await expectNoHorizontalScroll(page);
    await page.context().clearCookies();
  });

  test(`${width} px: si el panel no carga, error de sección con Reintentar; «Condonar» destructivo devuelve el foco (DX-343)`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const { start, token, appointmentId } = await lateAppointment(request, `Condona${width}${suffix}`.slice(0, 30), width < 768 ? 10 : 9);
    await cancelLate(page, token);

    let failOnce = true;
    await page.route(`**/appointments/${appointmentId}/cancellation-fee`, async (route) => {
      if (route.request().method() === 'GET' && failOnce) {
        failOnce = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      } else {
        await route.continue();
      }
    });
    const panel = await openAppointment(page, start);
    const failure = page.getByRole('alert').filter({ hasText: 'Cargo sin cargar' });
    await expect(failure).toBeVisible({ timeout: 15_000 });
    await expect(failure).toContainText('No se pudo cargar el estado del cargo.');
    // El encabezado del panel sigue sobre el error: la sección conserva su nombre.
    await expect(feeHeading(panel)).toBeVisible();
    await audit(page, failure, 'panel-error');
    await failure.getByRole('button', { name: 'Reintentar' }).click();
    await expect(panel).toContainText('Importe sugerido', { timeout: 10_000 });
    await page.unroute(`**/appointments/${appointmentId}/cancellation-fee`);

    await panel.getByRole('button', { name: 'Condonar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Condonar el cargo' });
    await expectDialogInsideViewport(page, dialog);
    // Se confirma con la variante destructiva, como «Anular» en un abono.
    await expect(dialog.getByRole('button', { name: 'Condonar' })).toHaveClass(/bg-danger/);
    await dialog.getByLabel('Motivo').fill('Cortesía de la clínica');
    await audit(page, dialog, 'dialogo-condonar');
    await dialog.getByRole('button', { name: 'Condonar' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(panel).toContainText('Cargo condonado.');
    await expect(feeHeading(panel)).toBeFocused();
    await expectNoHorizontalScroll(page);
    await page.context().clearCookies();
  });
}

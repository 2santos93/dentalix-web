import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e SEC-050: el cargo por inasistencia o cancelación tardía (DX-291) ya no
 * se quita ni cambia de estado desde el plan. La dentista ve el ítem del cargo
 * en «Cargos administrativos» sin «Quitar», con el estado bloqueado y sin
 * «Anular cargo»; el ADMIN lo anula con motivo desde el plan y el ítem sale
 * del plan (la vista del cargo pasa a VOIDED). A 1440 y a 390 px, sin scroll
 * horizontal.
 *
 * Una clínica nueva por corrida. En serie.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `anular-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.void.${suffix}@example.com` };
const dentist = { fullName: 'Dra. Diana Ortiz', email: `diana.void.${suffix}@example.com` };

let session: ApiSession;
let providerId: string;
let policyVersionId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Anular ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  providerId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string }[])[0].id;
  policyVersionId = (
    await apiPost<{ id: string }>(request, session, `/locations/${principal}/cancellation-policy`, {
      noticeHours: 24,
      suggestedFee: 50000,
      currency: 'COP',
      patientText: 'Avísanos con un día de antelación.',
    })
  ).id;
});

/**
 * Un paciente que canceló tarde por el enlace (política comunicada y
 * aceptada) y su cargo de 50.000 generado por el ADMIN.
 */
async function chargedPatient(
  request: APIRequestContext,
  lastName: string,
  hours: number,
): Promise<{ patientId: string; appointmentId: string }> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Pablo',
    lastName,
    docType: 'CC',
    docNumber: lastName.slice(0, 20),
    sex: 'M',
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
  const token = link.url.split('/confirmar/')[1];
  const cancelled = await request.post(`${API_URL}/public/appointment-confirmations/${token}`, {
    headers: { 'X-Tenant-Host': session.headers['X-Tenant-Host'] },
    data: { action: 'cancel', acknowledgePolicy: true, policyVersionId },
  });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  await apiPost(request, session, `/appointments/${appointment.id}/cancellation-fee`, {});
  return { patientId: patient.id, appointmentId: appointment.id };
}

/** La fila (tabla a 1440, tarjeta a 390) visible del ítem del cargo. */
function feeRow(page: Page) {
  return page
    .locator('tr, li')
    .filter({ hasText: 'Cargo por inasistencia o cancelación tardía:' })
    .locator('visible=true')
    .first();
}

async function flow(page: Page, request: APIRequestContext, width: number, lastName: string) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  const { patientId, appointmentId } = await chargedPatient(request, lastName, width < 768 ? 6 : 5);

  // --- Dentista: ve el cargo, pero no lo quita, no le cambia el estado ni lo anula.
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const dentistRow = feeRow(page);
  await expect(dentistRow).toBeVisible({ timeout: 15_000 });
  await expect(dentistRow.getByRole('button', { name: 'Quitar', exact: true })).toHaveCount(0);
  await expect(dentistRow.getByRole('combobox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Anular cargo' }).locator('visible=true')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.context().clearCookies();

  // --- ADMIN: lo anula con motivo desde el plan.
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const adminRow = feeRow(page);
  await expect(adminRow).toBeVisible({ timeout: 15_000 });
  await expect(adminRow.getByRole('button', { name: 'Quitar', exact: true })).toHaveCount(0);
  await adminRow.getByRole('button', { name: 'Anular cargo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anular el cargo' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByRole('button', { name: 'Anular cargo' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Escribe el motivo');
  await dialog.getByLabel('Motivo').fill('Cargo generado por error: avisó por teléfono');
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Anular cargo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(feeRow(page)).toHaveCount(0, { timeout: 10_000 });
  await expectNoHorizontalScroll(page);

  const view = await request.get(`${API_URL}/appointments/${appointmentId}/cancellation-fee`, {
    headers: session.headers,
  });
  expect(await view.json()).toMatchObject({
    status: 'VOIDED',
    fee: { voidReason: 'Cargo generado por error: avisó por teléfono', planItemRemoved: true },
  });
  await page.context().clearCookies();
}

test('1440 px: la dentista no toca el cargo; el ADMIN lo anula con motivo', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 1440, `Escritorio${suffix}`.slice(0, 30));
});

test('390 px: el mismo flujo sin scroll horizontal', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 390, `Movil${suffix}`.slice(0, 30));
});

import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { axeInBothThemes } from './support/axe';

/**
 * e2e SEC-050: el cargo por inasistencia o cancelación tardía (DX-291) ya no
 * se quita ni cambia de estado desde el plan. La dentista ve el ítem del cargo
 * en «Cargos administrativos» sin «Quitar», con el estado bloqueado y sin
 * «Anular cargo»; el ADMIN lo anula con motivo desde el plan y el ítem sale
 * del plan (la vista del cargo pasa a VOIDED). A 1440 y a 390 px, sin scroll
 * horizontal.
 *
 * DX-343: «Anular cargo» se confirma con el botón destructivo; cada uno tiene
 * un nombre único (ítem e importe, y «Cargo n de N» con varios); tras anular
 * el foco va al encabezado de los ítems; tras un 409 el diálogo no reenvía y,
 * si releer el plan falla, error de sección con «Reintentar». axe (todas las
 * violaciones) en claro y oscuro. Con DX343_QA_DIR guarda capturas.
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
const QA_DIR = process.env.DX343_QA_DIR;

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
    data: { ranges: [] },
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
  existingPatientId?: string,
): Promise<{ patientId: string; appointmentId: string }> {
  const patient = existingPatientId
    ? { id: existingPatientId }
    : await apiPost<{ id: string }>(request, session, '/patients', {
        firstName: 'Pablo',
        lastName,
        docType: 'NATIONAL_ID',
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

const itemsHeading = (page: Page) => page.getByRole('heading', { name: 'Ítems del plan de tratamiento' });

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
  await adminRow.scrollIntoViewIfNeeded();
  await audit(page, itemsHeading(page).locator('..'), 'plan');
  const action = adminRow.getByRole('button', { name: /^Anular cargo: / });
  await expect(action).toHaveAccessibleName(/^Anular cargo: .+, .*50\.000/);
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Anular el cargo' });
  await expectDialogInsideViewport(page, dialog);
  // Se confirma con la variante destructiva, como «Anular» en un abono.
  await expect(dialog.getByRole('button', { name: 'Anular cargo' })).toHaveClass(/bg-danger/);
  await dialog.getByLabel('Motivo').fill('Cargo generado por error: avisó por teléfono');
  await audit(page, dialog, 'dialogo-anular');
  await dialog.getByLabel('Motivo').fill('');
  await dialog.getByRole('button', { name: 'Anular cargo' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Escribe el motivo');
  await dialog.getByLabel('Motivo').fill('Cargo generado por error: avisó por teléfono');
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Anular cargo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(itemsHeading(page)).toBeFocused();
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

for (const width of [1440, 390]) {
  test(`${width} px: dos cargos del mismo importe tienen nombres únicos que coinciden con su fila (DX-343)`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const { patientId } = await chargedPatient(request, `Doble${width}${suffix}`.slice(0, 30), width < 768 ? 12 : 11);
    await chargedPatient(request, '', width < 768 ? 14 : 13, patientId);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    const rows = page
      .locator('tr, li')
      .filter({ hasText: 'Cargo por inasistencia o cancelación tardía:' })
      .locator('visible=true');
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    for (const n of [1, 2]) {
      const row = rows.nth(n - 1);
      await expect(row.getByText(`Cargo ${n} de 2`, { exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: /Anular cargo/ })).toHaveAccessibleName(
        new RegExp(`^Anular cargo ${n} de 2: .+, .*50\\.000`),
      );
    }
    await rows.first().scrollIntoViewIfNeeded();
    await audit(page, itemsHeading(page).locator('..'), 'plan-dos-cargos');
    await expectNoHorizontalScroll(page);
    await page.context().clearCookies();
  });

  test(`${width} px: tras un 409 el diálogo no reenvía y, si releer el plan falla, error de sección con Reintentar (DX-343)`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const { patientId, appointmentId } = await chargedPatient(request, `Choque${width}${suffix}`.slice(0, 30), width < 768 ? 16 : 15);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    await feeRow(page).getByRole('button', { name: /Anular cargo/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Anular el cargo' });
    await dialog.getByLabel('Motivo').fill('Motivo de quien llegó tarde');

    // Otra persona lo anula mientras el diálogo está abierto, y la relectura del plan falla.
    const other = await request.post(`${API_URL}/appointments/${appointmentId}/cancellation-fee/void`, {
      headers: session.headers,
      data: { reason: 'Anulado por otra persona' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();
    await page.route('**/treatment-plans/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      } else {
        await route.continue();
      }
    });
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee/void`)) posts++;
    });
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee/void`) && r.status() === 409,
    );
    await dialog.getByRole('button', { name: 'Anular cargo' }).click();
    await conflict;
    await expect(dialog.getByRole('status')).toContainText('cambió mientras lo tenías abierto');
    await expect(dialog.getByRole('button', { name: 'Anular cargo' })).toHaveCount(0);
    await expect(dialog.getByLabel('Motivo')).toBeDisabled();
    await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
    await audit(page, dialog, 'dialogo-anular-409');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(itemsHeading(page)).toBeFocused();

    // Sin una lectura buena no queda la fila vieja: error de sección con Reintentar.
    const failure = page.getByRole('alert').filter({ hasText: 'No pudimos actualizar el plan.' });
    await expect(failure).toBeVisible({ timeout: 10_000 });
    await expect(feeRow(page)).toHaveCount(0);
    expect(posts).toBe(1);
    await audit(page, failure, 'plan-error');
    await page.unroute('**/treatment-plans/*');
    await failure.getByRole('button', { name: 'Reintentar' }).click();
    await expect(failure).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('table', { name: /ítems de la visita/i }).or(page.getByText('Este plan todavía no tiene ítems.')).first()).toBeVisible();
    await expect(feeRow(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.context().clearCookies();
  });
}

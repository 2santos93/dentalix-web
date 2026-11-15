import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { fillDate } from './support/dates';
import { loginAs } from './support/auth';
import { API_URL } from './support/urls';
import { atSede, sedeDayFromToday } from './support/clock';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeViolations } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';

/**
 * e2e DX-046 — la respuesta del paciente por el enlace llega a la agenda sin
 * recargar, y cancelar por el enlace pide un «¿Seguro?».
 *
 * 1. Con la agenda abierta (Día › Lista), el paciente confirma una cita y
 *    cancela otra por la API pública; al volver a la pestaña
 *    (`visibilitychange`) la agenda las muestra «Confirmada» y «Cancelada»
 *    sin recargar la página (sin esperar el minuto del intervalo).
 * 2. En la página pública, «Cancelar cita» abre el paso de confirmación:
 *    «Volver» y Escape no cancelan; «Sí, cancelar» sí.
 *
 * A 1440 y 390 px. Requiere la API y la web levantadas (playwright.config.ts).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const DAY = sedeDayFromToday(2);

interface Clinic {
  session: ApiSession;
  email: string;
  providerId: string;
}

async function newClinic(request: APIRequestContext, tag: string): Promise<Clinic> {
  const email = `dx046.${tag}.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain: `test-dx046-${tag}-${suffix}`.slice(0, 40),
    clinicName: `Clinica Respuesta ${tag} ${suffix}`,
    fullName: 'Dra. Agenda Viva',
    email,
    password,
  });
  // Sin horario de atención: cualquier hora se puede agendar.
  await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  return { session, email, providerId: staff[0].userId };
}

/** Paciente + cita de DAY a `hhmm` (30 min) + su enlace; devuelve el token. */
async function appointmentWithLink(
  request: APIRequestContext,
  clinic: Clinic,
  firstName: string,
  lastName: string,
  hhmm: string,
  endHhmm: string,
): Promise<{ id: string; token: string }> {
  const patient = await apiPost<{ id: string }>(request, clinic.session, '/patients', {
    firstName,
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `R${randomUUID().replace(/-/g, '')}`.slice(0, 20),
    sex: 'F',
    phone: '+58 414 555 0146',
  });
  const appt = await apiPost<{ id: string }>(request, clinic.session, '/appointments', {
    patientId: patient.id,
    providerId: clinic.providerId,
    start: atSede(DAY, hhmm).toISOString(),
    end: atSede(DAY, endHhmm).toISOString(),
  });
  const link = await apiPost<{ url: string }>(
    request,
    clinic.session,
    `/appointments/${appt.id}/confirmation-link`,
    {},
  );
  return { id: appt.id, token: link.url.split('/').pop()! };
}

/** Lo que haría el navegador del paciente: POST público, sin sesión. */
async function respondAsPatient(
  request: APIRequestContext,
  clinic: Clinic,
  token: string,
  action: 'confirm' | 'cancel',
): Promise<void> {
  const res = await request.post(`${API_URL}/public/appointment-confirmations/${token}`, {
    headers: { 'X-Tenant-Host': clinic.session.headers['X-Tenant-Host'] },
    data: { action, policyVersionId: null },
  });
  expect(res.ok(), `respuesta pública falló: ${await res.text()}`).toBeTruthy();
}

async function appointmentStatus(request: APIRequestContext, clinic: Clinic, id: string): Promise<string> {
  const res = await request.get(`${API_URL}/appointments/${id}`, { headers: clinic.session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { status: string }).status;
}

/** El selector de estado visible de la fila de `range` (en el teléfono, la tarjeta). */
function statusOf(page: Page, range: string) {
  return page
    .getByRole('combobox', { name: new RegExp(`^Estado de la cita de ${range} de `) })
    .filter({ visible: true })
    .first();
}

/** Volver a la pestaña: lo que dispara la relectura de fondo. */
async function returnToTab(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

for (const width of [1440, 390] as const) {
  test(`${width} px: la agenda abierta muestra la confirmación y la cancelación del paciente sin recargar`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const clinic = await newClinic(request, `ag${width}`);
    const last = `Viva${suffix}`.slice(0, 30);
    const confirmer = await appointmentWithLink(request, clinic, 'Elena', last, '10:00', '10:30');
    const canceller = await appointmentWithLink(request, clinic, 'Marta', last, '11:00', '11:30');

    await loginAs(page, clinic.session.origin, clinic.email, password);
    await page.goto(`${clinic.session.origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    // DX-121: el Día abre en columnas; la fila con estado está en «Lista».
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await fillDate(page, 'Fecha', DAY);
    await expect(statusOf(page, '10:00–10:30')).toHaveText('Agendada', { timeout: 15_000 });
    await expect(statusOf(page, '11:00–11:30')).toHaveText('Agendada');

    // Marca en la página: si algo la recargara, desaparecería.
    await page.evaluate(() => {
      (window as unknown as { __dx046?: boolean }).__dx046 = true;
    });
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    // El paciente confirma por su enlace (otro dispositivo).
    await respondAsPatient(request, clinic, confirmer.token, 'confirm');
    const reread = page.waitForResponse(
      (res) => res.request().method() === 'GET' && /\/appointments\?/.test(res.url()),
    );
    await returnToTab(page);
    expect((await reread).ok()).toBeTruthy();
    await expect(statusOf(page, '10:00–10:30')).toHaveText('Confirmada', { timeout: 10_000 });
    // Relectura de fondo: sin el «Cargando agenda…» ni el «Actualizando…».
    await expect(page.getByText('Cargando agenda…')).toHaveCount(0);

    // El otro paciente cancela.
    await respondAsPatient(request, clinic, canceller.token, 'cancel');
    await returnToTab(page);
    await expect(statusOf(page, '11:00–11:30')).toHaveText('Cancelada', { timeout: 10_000 });

    expect(await page.evaluate(() => (window as unknown as { __dx046?: boolean }).__dx046)).toBe(true);
    expect(navigations).toEqual([]);
    await expectNoHorizontalScroll(page);
    await shot(page, 'agenda-relectura', width);
  });

  test(`${width} px: en el enlace, «Cancelar cita» pide confirmación; «Volver» y Escape no cancelan, «Sí, cancelar» sí`, async ({
    browser,
    request,
  }) => {
    const clinic = await newClinic(request, `pub${width}`);
    const appt = await appointmentWithLink(request, clinic, 'Paula', `Enlace${suffix}`.slice(0, 30), '12:00', '12:30');

    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 } });
    const patientPage = await context.newPage();
    await patientPage.goto(`${clinic.session.origin}/confirmar/${appt.token}`);
    const cancel = patientPage.getByRole('button', { name: 'Cancelar cita' });
    await expect(cancel).toBeVisible({ timeout: 15_000 });
    const posts: string[] = [];
    patientPage.on('request', (req) => {
      if (req.method() === 'POST' && /\/public\/appointment-confirmations\//.test(req.url())) posts.push(req.url());
    });

    // 1. «Volver»: se cierra, el foco vuelve a «Cancelar cita» y nada se envía.
    await cancel.click();
    const dialog = patientPage.getByRole('dialog', { name: '¿Seguro que quieres cancelar la cita?' });
    await expectDialogInsideViewport(patientPage, dialog);
    await expect(dialog).toContainText('La clínica recibirá tu cancelación');
    const back = dialog.getByRole('button', { name: 'Volver' });
    const yes = dialog.getByRole('button', { name: 'Sí, cancelar' });
    await expect(back).toBeFocused();
    for (const control of [back, yes]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
    expect(await axeViolations(patientPage, dialog)).toEqual([]);
    await expectNoHorizontalScroll(patientPage);
    await shot(patientPage, 'enlace-seguro-cancelar', width);
    await back.click();
    await expect(dialog).toHaveCount(0);
    await expect(cancel).toBeFocused();
    expect(posts).toEqual([]);
    expect(await appointmentStatus(request, clinic, appt.id)).toBe('SCHEDULED');

    // 2. Escape: igual.
    await cancel.click();
    await expect(dialog).toBeVisible();
    await patientPage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([]);
    expect(await appointmentStatus(request, clinic, appt.id)).toBe('SCHEDULED');

    // 3. «Sí, cancelar»: cancela una vez y el foco va al resultado.
    await cancel.click();
    await yes.click();
    await expect(patientPage.getByText(/Cancelaste la cita/)).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveCount(0);
    await expect(patientPage.getByRole('heading', { name: 'Ya respondiste' })).toBeFocused();
    expect(posts).toHaveLength(1);
    expect(await appointmentStatus(request, clinic, appt.id)).toBe('CANCELLED');
    await context.close();
  });
}

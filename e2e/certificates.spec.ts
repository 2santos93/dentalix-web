import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, SEDE_TZ, sedeWeekdayFromToday } from './support/clock';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-306): certificados del paciente desde la ficha.
 *
 *   1. A 1440 y 390 px, como ADMIN: «Certificados» → «Emitir justificante» con
 *      la cita atendida ya elegida → «Emitir» → «… emitido» con «Imprimir»
 *      (abre el PDF en otra pestaña) → en la lista «Vigente» → «Anular» con
 *      motivo → «Anulado» con el motivo. Sin scroll horizontal y el diálogo
 *      dentro del viewport.
 *   2. A 1440 px: «Certificado de reposo» (ADMIN con registro profesional), 3
 *      días desde el día de la atención → la lista dice «3 días de reposo».
 *   3. «Enviar por WhatsApp» el reposo vigente: «Abrir WhatsApp» hacia wa.me y
 *      el enlace; el paciente lo abre sin sesión a 1440 y 390 y ve el tipo y el nº.
 *   4. A 390 px, recepción: ve la lista y «Emitir justificante», no el reposo.
 *
 * La cita se siembra por la API y acaba COMPLETED (la API solo certifica citas
 * atendidas). Con E2E_QA_DIR definido guarda capturas.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const LICENSE = 'MPPS 45678';
const admin = {
  clinicName: `Clinica Certificados ${suffix}`,
  subdomain: `test-clinic-cert-${suffix}`,
  fullName: 'Dra Andreina Salazar',
  email: `test.user.cert.${suffix}@example.com`,
  password,
};
const dentist = { fullName: 'Luis Mendoza', email: `luis.cert.${suffix}@example.com`, role: 'DENTIST', password };
const reception = { fullName: 'Rita Recepción', email: `rita.cert.${suffix}@example.com`, role: 'RECEPTION', password };

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'movil', width: 390, height: 844 },
];

function userIdOf(session: ApiSession): string {
  const token = session.headers.Authorization.replace('Bearer ', '');
  return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub: string }).sub;
}

async function apiCall(request: APIRequestContext, session: ApiSession, method: 'get' | 'patch', path: string, data?: object) {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<unknown>;
}

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  await page.screenshot({ path: join(QA_DIR, `dx306-${name}.png`), fullPage: true });
}

test('certificados: justificante emitido, impreso y anulado a 1440 y 390; reposo con registro; recepción sin reposo', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  // --- Siembra por la API: clínica, odontólogo, recepción, registro del ADMIN, paciente y cita atendida ---
  const session = await registerClinicViaApi(request, admin);
  await addStaffViaApi(request, session, dentist);
  await addStaffViaApi(request, session, reception);
  await apiCall(request, session, 'patch', `/staff/${userIdOf(session)}`, { professionalLicense: LICENSE });
  const staff = (await apiCall(request, session, 'get', '/staff')) as { userId: string; fullName: string }[];
  const dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Yusmary',
    lastName: `Rondon${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 12),
    sex: 'F',
    birthDate: '1985-06-20',
    phone: '+58 412 1234567',
  });
  const day = sedeWeekdayFromToday(2);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId: dentistId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });
  await apiCall(request, session, 'patch', `/appointments/${appointment.id}`, { status: 'COMPLETED' });

  await loginAs(page, session.origin, admin.email, password);
  const panel = page.locator('#tabpanel-certificates');

  for (const viewport of VIEWPORTS) {
    // --- 1. Emitir el justificante de la cita atendida ---
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${session.origin}/patients/${patient.id}?tab=certificates`);
    await panel.getByRole('button', { name: 'Emitir justificante' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Emitir justificante' });
    await expect(dialog).toBeVisible();
    const radio = dialog.getByRole('radiogroup', { name: 'Cita atendida' }).getByRole('radio').first();
    await expect(radio).toBeChecked({ timeout: 15_000 });
    await expectDialogInsideViewport(page, dialog);
    await shoot(page, `emitir-${viewport.name}`);
    await dialog.getByRole('button', { name: 'Emitir' }).click();
    await expect(dialog.getByText(/^Justificante de asistencia nº \d{6} emitido$/)).toBeVisible();

    // «Imprimir»: el PDF (con la sesión) se abre en otra pestaña.
    const popupPromise = page.waitForEvent('popup');
    await dialog.getByRole('button', { name: 'Imprimir' }).click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url(), { timeout: 15_000 }).toMatch(/^blob:/);
    await popup.close();
    await dialog.getByRole('button', { name: 'Cerrar' }).last().click();
    await expect(dialog).toBeHidden();

    // En la lista, vigente.
    const live = panel.locator('[data-status="LIVE"]').first();
    await expect(live).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, `lista-${viewport.name}`);

    // --- Anular con motivo ---
    await panel.getByRole('button', { name: /^Acciones de Justificante de asistencia nº/ }).first().click();
    await page.getByRole('menuitem', { name: 'Anular' }).click();
    const voidDialog = page.getByRole('dialog', { name: 'Anular certificado' });
    await expect(voidDialog).toBeVisible();
    await expectDialogInsideViewport(page, voidDialog);
    await voidDialog.getByLabel('Motivo de la anulación').fill(`Fecha equivocada ${viewport.name}`);
    await voidDialog.getByRole('button', { name: 'Anular certificado' }).click();
    await expect(voidDialog).toBeHidden();
    await expect(panel.getByText(`Motivo: Fecha equivocada ${viewport.name}`)).toBeVisible();
    await expect(panel.locator('[data-status="LIVE"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shoot(page, `anulado-${viewport.name}`);
  }

  // --- 2. Certificado de reposo (ADMIN con registro profesional) ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${session.origin}/patients/${patient.id}?tab=certificates`);
  await panel.getByRole('button', { name: 'Certificado de reposo' }).click({ timeout: 15_000 });
  const restDialog = page.getByRole('dialog', { name: 'Certificado de reposo' });
  await expect(restDialog.getByRole('radiogroup', { name: 'Cita atendida' }).getByRole('radio').first()).toBeChecked({
    timeout: 15_000,
  });
  await expect(restDialog.getByText('Te falta el registro profesional')).toHaveCount(0);
  const days = restDialog.getByLabel('Días de reposo');
  await days.fill('3');
  await expect(restDialog.getByText(/^Reposo del .+ al .+\.$/)).toBeVisible();
  await shoot(page, 'reposo-escritorio');
  await restDialog.getByRole('button', { name: 'Emitir' }).click();
  await expect(restDialog.getByText(/^Certificado de reposo nº \d{6} emitido$/)).toBeVisible();
  await restDialog.getByRole('button', { name: 'Cerrar' }).last().click();
  await expect(panel.getByText(/3 días de reposo del/)).toBeVisible();

  // --- 3. «Enviar por WhatsApp» el reposo vigente y abrir la copia sin sesión ---
  await panel.getByRole('button', { name: /^Enviar por WhatsApp/ }).click();
  const sendDialog = page.getByRole('dialog', { name: 'Enviar por WhatsApp' });
  await expect(sendDialog).toBeVisible();
  await expectDialogInsideViewport(page, sendDialog);
  await sendDialog.getByRole('button', { name: 'Crear enlace' }).click();
  await expect(sendDialog.getByText('Enlace listo para ••• 4567')).toBeVisible({ timeout: 15_000 });
  const wa = sendDialog.getByRole('link', { name: /Abrir WhatsApp/ });
  expect((await wa.getAttribute('href')) ?? '').toMatch(/^https:\/\/wa\.me\/584121234567\?text=/);
  const copyUrl = await sendDialog.getByLabel('Enlace del certificado').inputValue();
  expect(copyUrl).toMatch(new RegExp(`^${session.origin}/certificado/copia/[A-Za-z0-9_-]+$`));
  await shoot(page, 'whatsapp-escritorio');
  await sendDialog.getByRole('button', { name: 'Cerrar' }).last().click();
  await expect(sendDialog).toBeHidden();

  const visitor = await browser.newContext({ timezoneId: SEDE_TZ, locale: E2E_BROWSER_LOCALE });
  const pub = await visitor.newPage();
  for (const viewport of VIEWPORTS) {
    await pub.setViewportSize({ width: viewport.width, height: viewport.height });
    const res = await pub.goto(copyUrl);
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(pub.getByRole('heading', { level: 1, name: /^Certificado de reposo nº \d{6}$/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pub.getByText(/3 días de reposo, del .+ al .+\./)).toBeVisible();
    await expect(pub.getByRole('link', { name: 'Descargar PDF' })).toBeVisible();
    await expectNoHorizontalScroll(pub);
    await shoot(pub, `copia-${viewport.name}`);
  }
  await visitor.close();

  // --- 4. Recepción, en el teléfono: lista y justificante, sin reposo ---
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: SEDE_TZ,
    locale: E2E_BROWSER_LOCALE,
  });
  const rita = await context.newPage();
  await loginAs(rita, session.origin, reception.email, password);
  await rita.goto(`${session.origin}/patients/${patient.id}?tab=certificates`);
  const ritaPanel = rita.locator('#tabpanel-certificates');
  await expect(ritaPanel.getByRole('button', { name: 'Emitir justificante' })).toBeVisible({ timeout: 15_000 });
  await expect(ritaPanel.getByText(/3 días de reposo del/)).toBeVisible();
  await expect(ritaPanel.getByRole('button', { name: 'Certificado de reposo' })).toHaveCount(0);
  await expectNoHorizontalScroll(rita);
  await shoot(rita, 'recepcion-movil');
  await context.close();
});

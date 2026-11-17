import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import {
  expectDialogInsideViewport,
  expectNoHorizontalOverflowInDialog,
  expectNoHorizontalScroll,
  expectNoHorizontalScrollIn,
} from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-564: indicaciones previas a la cita por tipo de cita.
 *
 * - Clínica nueva por la API con los idiomas es y en, tipos «Cirugía» y
 *   «Control» y una paciente en inglés con móvil.
 * - El ADMIN escribe las indicaciones de «Cirugía» en es y en en Ajustes ›
 *   Tipos de cita; un texto con `https://` da el error junto al campo.
 * - La hoja de la cita las enseña; el WhatsApp del enlace las lleva en inglés.
 * - La página pública las muestra en inglés y, al cambiar a español, cambian.
 * - Una cita «Control» (sin texto) no muestra nada.
 * - 390 y 1440 px sin scroll horizontal.
 *
 * En serie: cada test parte de lo que dejó el anterior.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `indicaciones-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Dra. Elena Márquez', email: `elena.indicaciones.${suffix}@example.com` };
const lastName = `Indic${suffix.slice(0, 6)}`;

const ES_TEXT = 'Ven en ayunas de 6 horas.\nTrae tus radiografías.';
const EN_TEXT = 'Come fasting for 6 hours.\nBring your X-rays.';

let session: ApiSession;
let patientId: string;
let surgeryTypeId: string;
let controlTypeId: string;
let providerId: string;
let confirmationUrl: string;
const day = sedeDayFromToday(3);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Indicaciones ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  const languages = await request.put(`${API_URL}/patients/languages`, {
    headers: session.headers,
    data: { languages: ['es', 'en'] },
  });
  expect(languages.ok(), await languages.text()).toBeTruthy();
  // Sin horario: la cita de prueba cae donde haga falta.
  await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  ({ id: surgeryTypeId } = await apiPost<{ id: string }>(request, session, '/appointment-types', {
    name: 'Cirugía',
    durationMinutes: 30,
    color: '#7C3AED',
  }));
  ({ id: controlTypeId } = await apiPost<{ id: string }>(request, session, '/appointment-types', {
    name: 'Control',
    durationMinutes: 30,
    color: '#0E7490',
  }));
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Grace',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `PV${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+58 414 555 0164',
    preferredLanguage: 'en',
  }));
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  providerId = staff[0].userId;
});

async function openSurgeryType(page: Page) {
  await page.goto(`${origin}/settings/tipos-de-cita`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tipos de cita' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Acciones de Cirugía' }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tipo de cita' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openDetail(page: Page, time: string) {
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  const row = page.locator('table tr', { hasText: `Grace ${lastName}` }).filter({ hasText: time });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /Detalle de la cita/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return sheet;
}

test('ADMIN escribe las indicaciones de «Cirugía» en es y en; un enlace da el error junto al campo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const dialog = await openSurgeryType(page);
  const group = dialog.getByRole('group', { name: /Indicaciones previas a la cita/ });
  await expect(group).toContainText('no escribas datos de un paciente. Sin enlaces, direcciones web ni correos, ni HTML.');
  const es = group.getByLabel('Español (es)', { exact: true });
  const en = group.getByLabel('English (en)', { exact: true });
  await expect(en).toBeVisible({ timeout: 15_000 });

  await es.fill(ES_TEXT);
  await en.fill('See https://example.com before coming.');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  const linkError = dialog.getByText('Las indicaciones no admiten enlaces ni HTML: escríbelas como texto.');
  await expect(linkError).toBeVisible();
  await expect(en).toHaveAttribute('aria-invalid', 'true');
  await expect(en).toHaveAttribute('aria-describedby', /type-pre-visit-en-error/);

  await en.fill(EN_TEXT);
  await expect(linkError).toBeHidden();
  const preview = dialog.getByTestId('pre-visit-preview');
  await expect(preview).toContainText('Antes de tu cita:');
  await expect(preview).toContainText('Before your appointment:');
  await expect(preview).toContainText('Bring your X-rays.');
  await expectNoHorizontalOverflowInDialog(dialog);
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const table = page.getByRole('table', { name: 'Tipos de cita' });
  await expect(table.getByRole('row').filter({ hasText: 'Cirugía' })).toContainText('Con indicaciones');
  await expect(table.getByRole('row').filter({ hasText: 'Control' })).not.toContainText('Con indicaciones');
  await expectNoHorizontalScrollIn(page);

  // Lo guardado vuelve al reabrir.
  const reopened = await openSurgeryType(page);
  await expect(reopened.getByLabel('English (en)', { exact: true })).toHaveValue(EN_TEXT);
});

test('la hoja de la cita las enseña y el WhatsApp del enlace las lleva en el idioma de la paciente', async ({
  page,
  request,
}) => {
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId,
    appointmentTypeId: surgeryTypeId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const sheet = await openDetail(page, '10:00');

  const row = sheet.getByTestId('appointment-pre-visit-instructions');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Indicaciones previas');
  await expect(row).toContainText('Español (es)');
  await expect(row).toContainText('Ven en ayunas de 6 horas.');
  await expect(row).toContainText('English (en)');
  await expect(row).toContainText('Bring your X-rays.');

  await sheet.getByRole('button', { name: 'Enviar confirmación' }).click();
  const linkInput = sheet.getByLabel('Enlace de confirmación');
  await expect(linkInput).toHaveValue(/\/confirmar\//, { timeout: 10_000 });
  confirmationUrl = await linkInput.inputValue();
  const href = (await sheet.getByRole('link', { name: /Abrir WhatsApp/ }).getAttribute('href')) ?? '';
  const message = decodeURIComponent(href.split('?text=')[1]);
  expect(message).toMatch(/^Hello Grace, this is a reminder of your appointment/);
  expect(message).toContain(confirmationUrl);
  expect(message).toContain(`Before your appointment: ${EN_TEXT}`);
  expect(message).not.toContain('Ven en ayunas');
});

test('la página pública las muestra en inglés y cambian al pasar a español (390 px)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const patientPage = await context.newPage();
  await patientPage.goto(confirmationUrl);
  await expect(patientPage.getByText(/Hello Grace,/)).toBeVisible({ timeout: 15_000 });
  const block = patientPage.getByTestId('public-pre-visit-instructions');
  await expect(block.getByRole('heading', { name: 'Before your appointment' })).toBeVisible();
  await expect(block).toContainText('Come fasting for 6 hours.');
  await expect(block).toContainText('Bring your X-rays.');
  await expectNoHorizontalScroll(patientPage);

  await patientPage.getByLabel('Language').selectOption('es');
  await expect(block.getByRole('heading', { name: 'Antes de tu cita' })).toBeVisible();
  await expect(block).toContainText('Ven en ayunas de 6 horas.');
  await expect(block).not.toContainText('Come fasting');
  await expectNoHorizontalScroll(patientPage);
  await context.close();
});

test('una cita «Control» (sin texto) no muestra indicaciones ni en la hoja ni en la página', async ({
  page,
  browser,
  request,
}) => {
  const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId,
    appointmentTypeId: controlTypeId,
    start: atSede(day, '12:00').toISOString(),
    end: atSede(day, '12:30').toISOString(),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const sheet = await openDetail(page, '12:00');
  await expect(sheet.getByText('Control', { exact: true })).toBeVisible();
  await expect(sheet.getByTestId('appointment-pre-visit-instructions')).toHaveCount(0);

  const link = await apiPost<{ url: string }>(request, session, `/appointments/${appt.id}/confirmation-link`, {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const patientPage = await context.newPage();
  await patientPage.goto(link.url);
  await expect(patientPage.getByText(/Hello Grace,/)).toBeVisible({ timeout: 15_000 });
  await expect(patientPage.getByTestId('public-pre-visit-instructions')).toHaveCount(0);
  await expectNoHorizontalScroll(patientPage);
  await context.close();
});

test('390 px: el modal de Ajustes y la hoja de la cita caben sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  const dialog = await openSurgeryType(page);
  await expectDialogInsideViewport(page, dialog);
  await expect(dialog.getByTestId('pre-visit-preview')).toBeVisible();
  await expectNoHorizontalOverflowInDialog(dialog);
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const sheet = await openDetail(page, '10:00');
  await expect(sheet.getByTestId('appointment-pre-visit-instructions')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflowInDialog(sheet);
  await expectNoHorizontalScroll(page);
});

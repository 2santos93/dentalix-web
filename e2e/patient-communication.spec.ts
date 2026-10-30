import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-128: bloque «Comunicaciones» de la ficha del paciente.
 *
 * - Escritorio (1440 px): recepción ve el canal (Email, el de la clínica) y el
 *   aviso de móvil no válido; intenta WhatsApp con ese fijo y el formulario lo
 *   explica en español; con un móvil válido guarda WhatsApp con el opt-in en
 *   persona y la ficha lo muestra en E.164.
 * - Móvil (390 px): recepción anota la baja de recordatorios desde el modal,
 *   sin scroll horizontal y con el diálogo dentro de la pantalla.
 * - El odontólogo lo ve en solo lectura (sin «Editar comunicaciones»).
 * - Un paciente sin móvil enseña el estado vacío «Sin móvil registrado».
 * - La página pública de baja (`/baja/<token>`) con un enlace inventado lo
 *   explica en español a 390 px. El flujo completo enlace → baja → el
 *   recordatorio no sale lo cubre el e2e de la API (reminder-opt-out).
 *
 * Una clínica nueva por corrida; los tests van en serie (el segundo parte del
 * estado que deja el primero).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `comunicaciones-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.com.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.com.${suffix}@example.com` };
const dentist = { fullName: 'Dra. Laura Gómez', email: `laura.com.${suffix}@example.com` };
const lastName = `Comunica${suffix}`.slice(0, 40);
// El texto exacto lo da la API; aquí importa que va junto al campo «Móvil».
const NEEDS_MOBILE = /móvil válido/;

let session: ApiSession;
let patientId: string;
let noPhoneId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Comunicaciones ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Carolina',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `COM${suffix}`.slice(0, 20),
    sex: 'F',
    email: `carolina.${suffix}@example.com`,
    phone: '601 234 5678',
  }));
  ({ id: noPhoneId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `COMB${suffix}`.slice(0, 20),
    sex: 'M',
  }));
});

test('escritorio: recepción pasa a WhatsApp con opt-in en persona y el móvil inválido se explica en español', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block).toContainText('Email', { timeout: 15_000 });
  await expect(block).toContainText('por defecto de la clínica');
  await expect(block.getByText('Móvil no válido')).toBeVisible();

  await block.getByRole('button', { name: 'Editar comunicaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones del paciente' });
  await dialog.getByLabel('Canal de los recordatorios').selectOption('WHATSAPP');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByLabel('Móvil')).toHaveAccessibleDescription(NEEDS_MOBILE);
  await expect(dialog.getByLabel('Móvil')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Móvil')).toBeFocused();

  await dialog.getByLabel('Móvil').fill('310 123 4567');
  await dialog.getByLabel('Acepta que la clínica le escriba por WhatsApp').check();
  await expect(dialog.getByLabel('¿Dónde lo aceptó?')).toHaveValue('IN_PERSON');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();

  await expect(block).toContainText('WhatsApp');
  await expect(block).toContainText('+57 310 1234567');
  await expect(block.getByText('Móvil válido')).toBeVisible();
  await expect(block).toContainText(`En persona · lo registró ${reception.fullName}`);
});

test('390 px: recepción anota la baja de recordatorios desde el modal, sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block).toContainText('Activos', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);

  await block.getByRole('button', { name: 'Editar comunicaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones del paciente' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Dado de baja de los recordatorios automáticos').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();

  await expect(block).toContainText('Dado de baja el');
  await expect(block).toContainText('anotada por la clínica');
  await expectNoHorizontalScroll(page);
});

test('el odontólogo lo ve en solo lectura', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block).toContainText('WhatsApp', { timeout: 15_000 });
  await expect(block.getByRole('button', { name: 'Editar comunicaciones' })).toHaveCount(0);
});

test('390 px: un paciente sin móvil muestra «Sin móvil registrado»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${noPhoneId}`);
  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block.getByText('Sin móvil registrado')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
});

test('390 px: la página pública de baja con un enlace inventado lo explica en español', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/baja/${'Z'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Este enlace caducó' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoHorizontalScroll(page);
});

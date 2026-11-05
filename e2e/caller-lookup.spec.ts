import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, type Page } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-224 · «¿Quién llama?»: el atajo Alt+Mayús+Q abre el diálogo; un número
 * (escrito de otra forma que el guardado) encuentra a un paciente, a un grupo
 * familiar o a nadie; a 390 px abre a pantalla completa sin scroll horizontal.
 * La sede principal de la clínica de prueba es la de la API (prefijo +58).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `llama-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.llama.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.llama.${suffix}@example.com` };

// Tres números distintos, cada uno guardado con 0 y espacios y buscado después
// sin el 0 troncal ni espacios.
const SINGLE = { stored: '0412 555 01 77', typed: '412-5550177' };
const FAMILY = { stored: '+58 414 555 02 88', typed: '(0414) 555-0288' };
const NONE = '0426 555 09 99';

let session: ApiSession;

async function seedPatient(
  request: APIRequestContext,
  firstName: string,
  doc: string,
  phone: string,
): Promise<void> {
  await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: `Llama${suffix}`.slice(0, 30),
    docType: 'NATIONAL_ID',
    docNumber: `${doc}${suffix}`.slice(0, 20),
    sex: 'F',
    phone,
  });
}

async function openByShortcut(page: Page) {
  await page.goto(`${origin}/dashboard`);
  // Señal determinista: el botón del encabezado solo se pinta cuando el atajo
  // ya está registrado (sin esperas fijas).
  await expect(page.locator('aside').getByRole('button', { name: '¿Quién llama?' })).toHaveAttribute(
    'aria-keyshortcuts',
    'Alt+Shift+Q',
  );
  await page.keyboard.press('Alt+Shift+KeyQ');
  const dialog = page.getByRole('dialog', { name: '¿Quién llama?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Número de teléfono')).toBeFocused();
  return dialog;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Llama ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await seedPatient(request, 'Clara', 'LA', SINGLE.stored);
  await seedPatient(request, 'Marta', 'LB', FAMILY.stored);
  await seedPatient(request, 'Pedro', 'LC', FAMILY.stored);
});

test('1440: el atajo abre el diálogo y una coincidencia única muestra su tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  const dialog = await openByShortcut(page);

  // Menos de 7 dígitos: se explica junto al campo y no se busca.
  await dialog.getByLabel('Número de teléfono').fill('412 55');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByText('Escribe el número completo')).toBeVisible();

  await dialog.getByLabel('Número de teléfono').fill(SINGLE.typed);
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  const card = dialog.getByTestId('caller-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Clara');
  await expect(card).toContainText('Sin cita próxima');
  await expect(card.getByRole('button', { name: /Nueva cita para Clara/ })).toBeVisible();
  // Recepción nunca recibe la alerta clínica.
  await expect(dialog.getByTestId('caller-critical-alert')).toHaveCount(0);
  await card.getByRole('link', { name: /Abrir la ficha de Clara/ }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+/);
});

test('1440: un número compartido muestra a todo el grupo familiar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  const dialog = await openByShortcut(page);
  await dialog.getByLabel('Número de teléfono').fill(FAMILY.typed);
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByTestId('caller-card')).toHaveCount(2);
  await expect(dialog).toContainText('Marta');
  await expect(dialog).toContainText('Pedro');
});

test('1440: sin coincidencias ofrece «Crear paciente» con el teléfono prellenado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  const dialog = await openByShortcut(page);
  await dialog.getByLabel('Número de teléfono').fill(NONE);
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByText('Ningún paciente con ese número').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Crear paciente' }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await expect(page.getByLabel('Teléfono (opcional)')).toHaveValue(NONE);
});

test('390: abre a pantalla completa, sin scroll horizontal, y el botón de la barra lo abre', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('banner').getByRole('button', { name: '¿Quién llama?' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Quién llama?' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.width).toBe(390);
  expect(box?.height).toBeCloseTo(844, 0);

  await dialog.getByLabel('Número de teléfono').fill(FAMILY.typed);
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByTestId('caller-card')).toHaveCount(2);
  await expectNoHorizontalScroll(page);
  const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

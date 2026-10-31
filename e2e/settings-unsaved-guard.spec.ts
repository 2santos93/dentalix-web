import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import type { ApiSession } from './support/api';

/**
 * e2e (F1): salir de una pantalla de Ajustes con cambios sin guardar pregunta
 * antes (UnsavedChangesGuard + useSettingsDraft), en el router real de Next.
 *
 *  1. Escritorio: un enlace de la barra lateral → «Tienes cambios sin
 *     guardar»; «Seguir editando» se queda con lo escrito.
 *  2. «Atrás» del navegador → el mismo diálogo; «Seguir editando» se queda.
 *  3. ⌘K → «Agenda» → el diálogo; «Salir sin guardar» lleva a la Agenda, nada
 *     se guardó, y un solo «Atrás» vuelve a Recetas (sin entrada duplicada).
 *  4. Teléfono: un enlace de la hoja «Más» pregunta; «Salir sin guardar»
 *     navega y la hoja se cierra.
 *  5. Sin cambios, los enlaces navegan sin preguntar.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `unsaved-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.unsaved.${suffix}@example.com`;
const TITLE = 'Tienes cambios sin guardar';

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cambios ${suffix}`,
    fullName: 'Úrsula Ajustes',
    email: adminEmail,
    password,
  });
});

async function openRecetasDirty(page: Page): Promise<void> {
  await page.goto(`${origin}/settings/recetas`);
  const validity = page.getByLabel('Validez (días)');
  await expect(validity).toHaveValue('30');
  await validity.fill('12');
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toBeVisible();
}

function guardDialog(page: Page) {
  return page.getByRole('dialog', { name: TITLE });
}

async function storedValidity(page: Page): Promise<number> {
  const res = await page.request.get(`${API_URL}/prescriptions/settings`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { validityDays: number }).validityDays;
}

test('escritorio: barra lateral, «Atrás» y ⌘K preguntan antes de descartar', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, adminEmail, password);
  await openRecetasDirty(page);
  const validity = page.getByLabel('Validez (días)');

  // 1. Enlace de la barra lateral.
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(guardDialog(page)).toBeVisible();
  await expect(guardDialog(page)).toContainText('Si sales ahora, los cambios de esta pantalla se pierden.');
  await guardDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(guardDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/recetas$/);
  await expect(validity).toHaveValue('12');

  // 2. «Atrás» del navegador (misma URL: el centinela).
  await page.evaluate(() => window.history.back());
  await expect(guardDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/recetas$/);
  await guardDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(guardDialog(page)).toBeHidden();
  await expect(validity).toHaveValue('12');
  // Vuelve a estar armado: otro «Atrás» pregunta otra vez.
  await page.evaluate(() => window.history.back());
  await expect(guardDialog(page)).toBeVisible();
  await guardDialog(page).getByRole('button', { name: 'Seguir editando' }).click();

  // 3. ⌘K → Agenda → salir sin guardar.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('combobox', { name: /Buscar/ });
  await expect(palette).toBeVisible();
  await palette.fill('Agenda');
  await page.getByRole('option', { name: /^Agenda/ }).first().click();
  await expect(guardDialog(page)).toBeVisible();
  await guardDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/agenda$/);
  expect(await storedValidity(page)).toBe(30);

  // Un solo «Atrás» vuelve a Recetas, sin cambios y sin diálogo.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/recetas$/);
  await expect(page.getByLabel('Validez (días)')).toHaveValue('30');
  await expect(guardDialog(page)).toHaveCount(0);

  // 5. Sin cambios, el enlace navega sin preguntar.
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(guardDialog(page)).toHaveCount(0);
});

test('teléfono: un enlace de la hoja «Más» pregunta y, al salir, la hoja se cierra', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, adminEmail, password);
  await openRecetasDirty(page);

  const bottomBar = page.getByRole('navigation', { name: 'Principal' });
  await bottomBar.getByRole('button', { name: 'Más', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Más' });
  await sheet.getByRole('navigation', { name: 'Más' }).getByRole('link', { name: 'Ajustes', exact: true }).click();
  await expect(guardDialog(page)).toBeVisible();
  await guardDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(sheet).toBeHidden();
  await expect(guardDialog(page)).toHaveCount(0);
  expect(await storedValidity(page)).toBe(30);
  // Un solo «Atrás» vuelve a Recetas.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/recetas$/);
});

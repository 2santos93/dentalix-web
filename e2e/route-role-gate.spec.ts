import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

// DX-096: una pantalla sin permiso, abierta por URL: en español, con salida y sin
// botones activos, a 390 y 1440 px.
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `permisos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.permisos.${suffix}@example.com` };
const reception = { fullName: 'Rosa Recepción', email: `rosa.permisos.${suffix}@example.com` };
const dentist = { fullName: 'Luis Odontólogo', role: 'DENTIST', email: `luis.permisos.${suffix}@example.com` };
const assistant = { fullName: 'Marta Asistente', role: 'ASSISTANT', email: `marta.permisos.${suffix}@example.com` };
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Permisos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, password });
  await addStaffViaApi(request, session, { ...assistant, password });
});

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`recepción abre Catálogo, Inventario y Personal por URL (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await loginAs(page, origin, reception.email, password);
    for (const path of ['/catalog', '/inventory', '/staff']) {
      await page.goto(`${origin}${path}`);
      await expect(page.getByText('No tienes permiso para ver esta pantalla')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('main').getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
      await expect(page.getByText('Insufficient role')).toHaveCount(0);
      await expect(page.locator('main').getByRole('button', { name: /Añadir|Invitar|Nuevo/ })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    }
  });
}

// DX-064: Odontólogo y Asistente leen el catálogo, sin acciones que la API les rechace.
for (const person of [dentist, assistant]) {
  test(`${person.fullName} lee Catálogo sin acciones de escritura ni 403`, async ({ page, request }) => {
    await apiPost(request, session, '/catalog/items', {
      code: `e2e-${person.role}-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: `Limpieza ${person.role}`,
      color: '#3366CC',
    });
    const denied: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 403) denied.push(r.url());
    });
    await loginAs(page, origin, person.email, password);
    await page.goto(`${origin}/catalog`);
    const main = page.locator('main');
    await expect(main.getByText(`Limpieza ${person.role}`).first()).toBeVisible({ timeout: 15_000 });
    await expect(main.getByRole('button', { name: 'Agregar ítem' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /Acciones de/ })).toHaveCount(0);
    await main.getByText(`Limpieza ${person.role}`).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(denied).toEqual([]);
  });
}

test('el administrador sigue viendo las tres pantallas', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  for (const path of ['/catalog', '/inventory', '/staff']) {
    await page.goto(`${origin}${path}`);
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No tienes permiso para ver esta pantalla')).toHaveCount(0);
  }
});

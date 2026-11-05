import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, registerClinicViaApi, type ApiSession } from './support/api';
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

test('el administrador sigue viendo las tres pantallas', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  for (const path of ['/catalog', '/inventory', '/staff']) {
    await page.goto(`${origin}${path}`);
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No tienes permiso para ver esta pantalla')).toHaveCount(0);
  }
});

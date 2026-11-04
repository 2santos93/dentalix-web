import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e SEC-014 (revisión B6): con la pestaña abierta en «Sede Valencia», un
 * ADMIN la desactiva. La siguiente escritura de esa pestaña recibe el 400
 * LOCATION_INACTIVE: se ve el mensaje en español, el cliente suelta la sede y
 * el selector pasa a «Todas las sedes» SIN recargar, sin ofrecer ya Valencia.
 * Se comprueba a 1440 px (selector de la barra lateral) y a 390 px (pastilla
 * de la barra superior); capturas en `test-results`.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `sedeoff-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.sedeoff.${suffix}@example.com`;
const VALENCIA = 'Sede Valencia';

let session: ApiSession;
let valencia: string;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sede Off ${suffix}`,
    fullName: 'Valeria Titular',
    email: adminEmail,
    password,
  });
  valencia = await createLocationViaApi(request, session, { name: VALENCIA, ...E2E_REGION });
});

test('tras el 400 de sede desactivada, el selector pasa a «Todas las sedes» sin recargar (1440 y 390 px)', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/new`);

  // Elegir Valencia recarga la vista con su cabecera.
  const sidebarSelect = page.locator('select[data-location-switcher]:visible').first();
  await sidebarSelect.selectOption({ label: VALENCIA });
  await expect(sidebarSelect).toHaveValue(valencia);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();

  // Con la pestaña abierta, el ADMIN desactiva Valencia (por la API).
  const off = await request.patch(`${API_URL}/locations/${valencia}`, {
    headers: session.headers,
    data: { isActive: false },
  });
  expect(off.ok(), `desactivar la sede falló: ${await off.text()}`).toBeTruthy();

  // Una escritura de esta pestaña: el alta de un paciente.
  await page.getByLabel('Nombre', { exact: true }).fill('Andreína');
  await page.getByLabel('Tipo de documento').selectOption('NATIONAL_ID');
  await page.getByLabel('Apellido', { exact: true }).fill('Rangel');
  await page.getByLabel('Número de documento').fill(`V${Date.now().toString().slice(-8)}`);
  await page.getByLabel('Sexo').selectOption('F');
  await page.getByRole('button', { name: /Autorización de datos/ }).click();
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  await expect(page.getByText(/Esta sede está desactivada/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/patients\/new$/);

  // 1440: el selector de la barra lateral, en «Todas las sedes» y sin Valencia.
  await expect(sidebarSelect).toHaveValue('');
  await expect(sidebarSelect.locator('option:checked')).toHaveText('Todas las sedes');
  await expect(sidebarSelect.locator('option', { hasText: VALENCIA })).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('dentalix.activeLocationId'))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('selector-1440.png') });

  // 390: la pastilla de la barra superior dice lo mismo, en la misma pestaña.
  await page.setViewportSize({ width: 390, height: 844 });
  const pill = page.locator('span[title^="Sede:"]');
  await expect(pill).toHaveAttribute('title', 'Sede: Todas las sedes');
  await expect(pill.locator('span').first()).toHaveText('Todas las sedes');
  await expect(page.locator('select[data-location-switcher]:visible').first()).toHaveValue('');
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath('selector-390.png') });
});

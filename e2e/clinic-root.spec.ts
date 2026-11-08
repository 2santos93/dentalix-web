import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { tenantOrigin, WEB_PORT } from './support/urls';

/**
 * e2e (DX-554): «/» en el host de una clínica es su entrada, nunca la landing
 * de Dentalix: sin sesión lleva al login con su marca y con sesión al inicio.
 * En el dominio principal la landing sigue igual.
 *
 * En la CI la web corre con `NEXT_PUBLIC_ROOT_DOMAIN=dentalix.local`, así que
 * `*.localhost` no es un subdominio del dominio raíz para la web: es justo el
 * caso de un host «ajeno» que antes caía en la landing.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const clinic = { subdomain: `entrada-${suffix}`, clinicName: `Clínica Entrada ${suffix}`, email: `entrada.${suffix}@example.com` };
/** El H1 de la landing de marketing (landing-page.tsx). */
const LANDING_TITLE = 'El software que mantiene tu clínica dental al día.';

test.beforeAll(async ({ request }) => {
  await registerClinicViaApi(request, {
    subdomain: clinic.subdomain,
    clinicName: clinic.clinicName,
    fullName: 'Dra. Entrada',
    email: clinic.email,
    password,
  });
});

test('subdominio sin sesión: «/» lleva al login con la marca de la clínica, sin la landing', async ({ page }) => {
  const origin = tenantOrigin(clinic.subdomain);
  // El HTML de «/» ya es de la clínica: su nombre, sin la landing y sin indexar.
  const res = await page.request.get(`${origin}/`, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(clinic.clinicName);
  expect(html).not.toContain(LANDING_TITLE);
  expect(html).toContain('noindex');

  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole('heading', { level: 1, name: clinic.clinicName })).toBeVisible();
  await expect(page.getByRole('heading', { name: LANDING_TITLE })).toHaveCount(0);
});

test('subdominio con sesión: «/» lleva al inicio', async ({ page }) => {
  const origin = tenantOrigin(clinic.subdomain);
  await loginAs(page, origin, clinic.email, password);

  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { name: LANDING_TITLE })).toHaveCount(0);
});

test('dominio principal: «/» sigue siendo la landing de Dentalix', async ({ page }) => {
  const origin = `http://localhost:${WEB_PORT}`;
  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible();
});

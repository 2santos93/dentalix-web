import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin, sessionCookie } from './support/auth';
import { registerClinicViaApi } from './support/api';

/**
 * Smoke e2e: register -> login against the REAL backend (no mocks).
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Auth: the backend resolves the tenant from the REQUEST HOST, so the whole
 * flow runs on `http://${subdomain}.localhost:3001` (see `./support/auth`),
 * not the shared `baseURL` (`http://localhost:3001`, which has no tenant).
 *
 * Uniqueness: subdomain/email are suffixed with `E2E_RUN_SUFFIX`, an env var
 * set by the `test:e2e` npm script (see package.json) so repeated runs never
 * collide with a previously-registered clinic. A local `npx playwright test`
 * invocation (without the npm script) falls back to `crypto.randomUUID()`.
 * `RegisterDto.subdomain` requires `/^[a-z0-9-]+$/`, so the suffix is kept
 * lowercase-alphanumeric only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic ${suffix}`;
const subdomain = `test-clinic-${suffix}`;
const fullName = 'Test User';
const email = `test.user.${suffix}@example.com`;
const password = 'Password123!';

test('register creates an account, then login succeeds against the real API', async ({
  page,
}) => {
  // Confirmar el registro con una contraseña errónea falla (DX-029, R2).
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName,
    fullName,
    email,
    password,
    tryWrongVerifyPassword: true,
  });

  // registerAndLogin already asserts the session cookie, but re-assert here
  // explicitly since that IS this test's purpose: the session works against
  // the real API (the cookie yields an access token).
  expect(await sessionCookie(page, origin)).toBeTruthy();
  expect(await accessTokenOf(page)).toBeTruthy();
});

test('el registro dice, al escribir, si la dirección web está libre, en uso o reservada', async ({ page }) => {
  const taken = `ocupada-${suffix}`.slice(0, 63);
  await registerClinicViaApi(page.request, {
    subdomain: taken,
    clinicName: `Ocupada ${suffix}`,
    fullName: 'Dueña Ocupada',
    email: `ocupada.${suffix}@example.com`,
    password,
  });
  await page.goto('/register');
  const address = page.getByLabel('Dirección web');
  const status = page.locator('#register-subdomain-status');
  // El sufijo de la plataforma sigue a la vista junto al campo.
  await expect(page.getByText(/^\.dentalix\./)).toBeVisible();

  await address.fill(taken);
  await expect(status).toHaveText('En uso, prueba otra.');

  await address.fill(`libre-${suffix}`.slice(0, 63));
  await expect(status).toHaveText('Disponible');

  await address.fill('admin');
  await expect(status).toHaveText('Reservada para la plataforma, prueba otra.');

  await address.fill('sonrisa-');
  await expect(status).toContainText('sin guion al principio ni al final');
});

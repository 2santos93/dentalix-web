import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Smoke e2e: register -> login against the REAL backend (no mocks).
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
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
  // --- Register ---
  await page.goto('/register');

  await page.getByLabel('Nombre de la clínica').fill(clinicName);
  await page.getByLabel('Subdominio').fill(subdomain);
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // A real 4xx from the API (e.g. subdomain/email collision) would leave us
  // on /register with an alert instead of redirecting — fail loudly instead
  // of hanging, so the actual backend error is visible in the report.
  // Scoped to the form's own error <p>, since Next.js also renders its own
  // route-announcer element with role="alert".
  const registerError = page.locator('p[role="alert"]');
  await expect(page)
    .toHaveURL(/\/login$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await registerError.isVisible())
        ? await registerError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Register did not redirect to /login. API error: ${message}`);
    });

  // --- Login ---
  // localhost:3001 has no tenant subdomain, so LoginForm renders the
  // subdomain input in addition to email/password.
  await page.getByLabel('Subdominio de la clínica').fill(subdomain);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const loginError = page.locator('p[role="alert"]');

  // Real outcome: either the app navigated to /dashboard (may 404 today,
  // that's fine — the route doesn't exist yet), OR the auth store persisted
  // a real accessToken to localStorage. Assert on that persisted state
  // rather than only on navigation, since /dashboard may not exist.
  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        if (/\/dashboard$/.test(page.url())) return true;

        const raw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
        return Boolean(parsed.state?.accessToken);
      },
      { timeout: 10_000, message: 'expected navigation to /dashboard or a persisted accessToken' },
    )
    .toBe(true);

  // Final, explicit assertion on the real persisted session (not a mock).
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  expect(authRaw).toBeTruthy();
  const auth = JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } };
  expect(auth.state?.accessToken).toBeTruthy();
});

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * e2e: register clinic + login, then create a patient through the real UI
 * and verify it shows up in the patients list — against the REAL backend
 * (no mocks).
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Uniqueness: subdomain/email/patient last name are suffixed with
 * `E2E_RUN_SUFFIX`, an env var set by the `test:e2e` npm script (see
 * package.json) so repeated runs never collide with previously-created
 * data. A local `npx playwright test` invocation (without the npm script)
 * falls back to `crypto.randomUUID()`. `RegisterDto.subdomain` requires
 * `/^[a-z0-9-]+$/`, so the suffix is kept lowercase-alphanumeric only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Patients ${suffix}`;
const subdomain = `test-clinic-pat-${suffix}`;
const fullName = 'Test User';
const email = `test.user.patients.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Ana';
const patientLastName = `Paciente${suffix}`;
const patientDocNumber = `DOC${suffix}`;

test('create patient via the UI -> it appears in the patients list', async ({ page }) => {
  // --- Register ---
  await page.goto('/register');

  await page.getByLabel('Nombre de la clínica').fill(clinicName);
  await page.getByLabel('Subdominio').fill(subdomain);
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Crear cuenta' }).click();

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

  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        const raw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
        return Boolean(parsed.state?.accessToken);
      },
      { timeout: 10_000, message: 'expected a persisted accessToken after login' },
    )
    .toBe(true);

  // LoginForm fires `router.push('/dashboard')` right after persisting the
  // tokens (see login-form.tsx) — that client-side navigation can still be
  // in flight when we issue our own `page.goto` below, which aborts it
  // (net::ERR_ABORTED). Let it settle first (that route may 404, that's
  // fine — we only need the in-flight navigation resolved).
  await page.waitForURL(/\/dashboard$/, { timeout: 5_000 }).catch(() => {});

  // --- Patients list is empty for this brand-new clinic ---
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();

  // Real assertion: the desktop table (visible at the default Desktop Chrome
  // viewport) has no row for a patient we haven't created yet. Scoping to
  // `table` avoids also matching the (CSS-hidden, but DOM-present) mobile
  // card list.
  await expect(page.locator('table', { hasText: patientLastName })).toHaveCount(0);

  // --- Create patient ---
  await page.getByRole('link', { name: 'Nuevo paciente' }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('F');

  const createError = page.locator('p[role="alert"]');
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  // Redirect back to /patients on success — surface the real API error
  // instead of hanging if creation failed.
  await expect(page)
    .toHaveURL(/\/patients$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await createError.isVisible())
        ? await createError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Create patient did not redirect to /patients. API error: ${message}`);
    });

  // --- The newly-created patient is visible in the list ---
  const patientRow = page.locator('table tr', { hasText: patientLastName });
  await expect(patientRow).toBeVisible({ timeout: 10_000 });
  await expect(patientRow).toContainText(patientFirstName);
  await expect(patientRow).toContainText(patientDocNumber);
});

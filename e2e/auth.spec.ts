import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';

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
  await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });

  // registerAndLogin already asserts the persisted session, but re-assert
  // here explicitly since that IS this test's purpose.
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  expect(authRaw).toBeTruthy();
  const auth = JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } };
  expect(auth.state?.accessToken).toBeTruthy();
});

import { expect, type Page } from '@playwright/test';

/**
 * Shared register+login flow for the e2e suite.
 *
 * The backend resolves the active tenant from the REQUEST HOST (see
 * `dentalix-api/src/shared/tenancy/tenant-host.middleware.ts`: "the host is
 * the authority for the active tenant"), and the web app's API client sends
 * `X-Tenant-Host: window.location.host` on every browser fetch (see
 * `src/lib/api/client.ts`). So a user of clinic `subdomain` must be ON
 * `http://${subdomain}.localhost:3001` for the browser to carry the right
 * tenant — `*.localhost` resolves to 127.0.0.1 automatically, no `/etc/hosts`
 * entry needed. The shared Playwright `baseURL` (`http://localhost:3001`) has
 * NO tenant, so callers must keep every post-login `page.goto` on the origin
 * this helper returns instead of using a relative path.
 *
 * The register form still has the "Subdominio" field (registration creates
 * the clinic, so it has to name it). The login form does NOT — it only takes
 * email + password; the tenant travels via the host we're already on.
 */
export interface RegisterAndLoginParams {
  subdomain: string;
  clinicName: string;
  fullName: string;
  email: string;
  password: string;
}

/**
 * Registers a brand-new clinic on `http://${subdomain}.localhost:3001` and
 * logs its owner in. Returns that origin so the caller can build every
 * subsequent absolute URL off it.
 */
export async function registerAndLogin(
  page: Page,
  { subdomain, clinicName, fullName, email, password }: RegisterAndLoginParams,
): Promise<string> {
  const origin = `http://${subdomain}.localhost:3001`;

  // --- Register ---
  await page.goto(`${origin}/register`);

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
  // No subdomain field here — the tenant travels via the `${subdomain}.
  // localhost:3001` host we're already on.
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const loginError = page.locator('p[role="alert"]');

  // Real outcome: either the app navigated past /login (LoginForm pushes to
  // /patients on success, may 404 for other reasons — that's fine), OR the
  // auth store persisted a real accessToken to localStorage. Assert on that
  // persisted state rather than only on navigation.
  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        if (!/\/login$/.test(page.url())) return true;

        const raw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
        return Boolean(parsed.state?.accessToken);
      },
      { timeout: 10_000, message: 'expected navigation away from /login or a persisted accessToken' },
    )
    .toBe(true);

  // Final, explicit assertion on the real persisted session (not a mock).
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  expect(authRaw).toBeTruthy();
  const auth = JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } };
  expect(auth.state?.accessToken).toBeTruthy();

  // LoginForm fires `router.push('/patients')` right after persisting the
  // tokens (see login-form.tsx) — that client-side navigation can still be in
  // flight when a caller issues its own `page.goto` right after this
  // resolves, which would abort it (net::ERR_ABORTED). Let it settle first.
  await page.waitForURL(/\/patients$/, { timeout: 5_000 }).catch(() => {});

  return origin;
}

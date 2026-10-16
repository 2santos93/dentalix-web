import { expect, type Page } from '@playwright/test';
import { tenantOrigin } from './urls';
import { registrationTokenFor } from './mail';

/** Cookie HttpOnly del refresh token (DX-062), del host de la clínica. */
export const SESSION_COOKIE = 'dentalix_rt';

/**
 * La cookie de sesión de `origin`, tal como la guarda el navegador. Se busca
 * para una URL de `/api/v1/auth`: la cookie solo viaja ahí (Path).
 */
export async function sessionCookie(page: Page, origin: string) {
  const cookies = await page.context().cookies(`${origin}/api/v1/auth/refresh`);
  return cookies.find((c) => c.name === SESSION_COOKIE);
}

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
  const origin = tenantOrigin(subdomain);

  // --- Register ---
  await page.goto(`${origin}/register`);

  await page.getByLabel('Nombre de la clínica').fill(clinicName);
  await page.getByLabel('Subdominio').fill(subdomain);
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  // exact: true targets only the password INPUT — the field has a show/hide
  // toggle whose accessible name would otherwise make a substring "Contraseña"
  // match resolve to 2 elements (strict-mode violation).
  await page.getByLabel('Contraseña', { exact: true }).fill(password);

  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // DX-029: el registro responde igual exista o no el correo y no crea nada
  // hasta abrir el enlace del email. Un 4xx real (p. ej. subdominio ocupado)
  // deja la alerta del formulario: falla con su texto en vez de colgarse.
  const registerError = page.locator('p[role="alert"]');
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' }))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await registerError.isVisible())
        ? await registerError.textContent()
        : 'unknown (no confirmation, no visible alert)';
      throw new Error(`Register did not reach «Revisa tu correo». API error: ${message}`);
    });

  // --- Confirmar desde el enlace del email ---
  const token = await registrationTokenFor(email);
  await page.goto(`${origin}/register/verificar/${token}`);
  await page.getByRole('button', { name: 'Confirmar y crear mi clínica' }).click();
  await expect(page.getByRole('heading', { name: '¡Tu clínica está lista!' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });

  // --- Login ---
  // No subdomain field here — the tenant travels via the `${subdomain}.
  // localhost:3001` host we're already on.
  await submitLogin(page, origin, email, password);

  return origin;
}

/**
 * Un access token de la sesión de la página, para sembrar datos por la API.
 * Desde DX-062 el access vive solo en memoria y el refresh en una cookie
 * HttpOnly, así que se pide uno nuevo con `POST /auth/refresh` DESDE la página
 * y por su mismo origen, como hace la app: el navegador manda la cookie y el
 * Origin, y guarda la cookie rotada, así que la página sigue con su sesión.
 */
export async function accessTokenOf(page: Page): Promise<string> {
  const { status, body } = await page.evaluate(async () => {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'X-Tenant-Host': window.location.host },
    });
    return { status: res.status, body: await res.text() };
  });
  expect(status, `refresh por cookie falló: ${status} ${body}`).toBe(201);
  return (JSON.parse(body) as { accessToken: string }).accessToken;
}

/**
 * Inicia sesión por la UI en `${origin}/login` con una cuenta que ya existe y
 * espera a la sesión real (cookie HttpOnly del host). Sirve para el re-login
 * tras cambiar la contraseña, para cuentas sembradas por la API, etc.
 */
export async function loginAs(page: Page, origin: string, email: string, password: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await submitLogin(page, origin, email, password);
}

/** Rellena y envía el formulario de login de la página actual (ya en /login). */
async function submitLogin(page: Page, origin: string, email: string, password: string): Promise<void> {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const loginError = page.locator('p[role="alert"]');

  // Real outcome: the app navigated past /login (LoginForm pushes to /patients
  // on success). Since DX-062 the session leaves nothing in localStorage: the
  // access token lives in memory and the refresh token in an HttpOnly cookie,
  // so assert on that cookie instead of on persisted state.
  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        return !/\/login$/.test(page.url());
      },
      { timeout: 10_000, message: 'expected navigation away from /login' },
    )
    .toBe(true);

  // Final, explicit assertion on the real session (not a mock): the HttpOnly
  // refresh cookie of THIS clinic's host.
  expect((await sessionCookie(page, origin))?.httpOnly).toBe(true);

  // LoginForm fires `router.push('/patients')` right after persisting the
  // tokens (see login-form.tsx) — that client-side navigation can still be in
  // flight when a caller issues its own `page.goto` right after this
  // resolves, which would abort it (net::ERR_ABORTED). Let it settle first.
  await page.waitForURL(/\/patients$/, { timeout: 5_000 }).catch(() => {});
}

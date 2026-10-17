import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { loginAs, waitForHydratedForm } from './support/auth';
import { addStaffViaApi, registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * DX-048 (SEC-028): tras 5 intentos fallidos de una cuenta el login espera
 * (backoff de la API, 429 + Retry-After) y la pantalla lo dice en español,
 * con cuenta atrás, en una región aria-live, también a 390 px. El mensaje es
 * el mismo exista o no el email. Un ADMIN lo desbloquea desde el perfil del
 * miembro en Personal.
 *
 * Requiere la API con el bloqueo por cuenta en sus valores por defecto
 * (LOGIN_LOCKOUT_FREE_FAILURES=5); scripts/e2e-ci.sh solo sube el de la IP.
 */
const PASSWORD = 'Password123!';
const WRONG = 'Equivocada-1';
const LOCKED = /^Demasiados intentos\. Vuelve a intentarlo en 1 min\.$/;

test.describe('login: demasiados intentos fallidos', () => {
  const suffix = randomUUID().slice(0, 8);
  const clinic = {
    subdomain: `bloqueo-${suffix}`,
    clinicName: `Clínica Bloqueo ${suffix}`,
    fullName: 'Dueña Bloqueo',
    email: `bloqueo.${suffix}@example.com`,
    password: PASSWORD,
  };
  const doctora = {
    fullName: 'Doctora Bloqueo',
    email: `doctora.${suffix}@example.com`,
    role: 'DENTIST',
    password: PASSWORD,
  };
  let origin = '';

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    const admin = await registerClinicViaApi(api, clinic);
    origin = admin.origin;
    await addStaffViaApi(api, admin, doctora);
    await api.dispose();
  });

  /** Fallos por la API (más rápido que por la UI): cuentan igual. */
  async function failViaApi(
    request: APIRequestContext,
    email: string,
    times: number,
  ): Promise<void> {
    const host = new URL(origin).host;
    for (let i = 0; i < times; i++) {
      const res = await request.post(`${API_URL}/auth/login`, {
        headers: { 'X-Tenant-Host': host },
        data: { email, password: WRONG },
      });
      expect(res.status()).toBe(401);
    }
  }

  async function submit(page: Page, email: string, password: string) {
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }

  test('a 390 px muestra la espera en español, con cuenta atrás y región aria-live, igual exista o no el email', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await failViaApi(request, doctora.email, 4);

    await page.goto(`${origin}/login`);
    await waitForHydratedForm(page);
    // 5.º fallo: aún es el 401 de credenciales.
    await submit(page, doctora.email, WRONG);
    await expect(
      page.locator('p[role="alert"]').filter({ hasText: 'Correo o contraseña incorrectos.' }),
    ).toBeVisible();

    // 6.º intento, con la contraseña BUENA: espera igualmente.
    await submit(page, doctora.email, PASSWORD);
    const live = page.locator('[aria-live="polite"]').filter({ hasText: 'Demasiados intentos' });
    await expect(live).toBeVisible();
    await expect(live.locator('span').first()).toHaveText(LOCKED);
    await expect(live).toContainText(/\d:\d\d/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-describedby', 'login-lock');
    await expect(page).toHaveURL(`${origin}/login`);
    await expectNoHorizontalScroll(page);
    const box = await live.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);

    // Sin enumeración: un email que no existe recibe exactamente el mismo aviso.
    const ghost = `nadie.${suffix}@example.com`;
    await failViaApi(request, ghost, 5);
    await page.goto(`${origin}/login`);
    await waitForHydratedForm(page);
    await submit(page, ghost, WRONG);
    const ghostLive = page.locator('[aria-live="polite"]').filter({ hasText: 'Demasiados intentos' });
    await expect(ghostLive.locator('span').first()).toHaveText(LOCKED);
  });

  test('el ADMIN desbloquea el inicio de sesión desde el perfil del miembro y ella entra', async ({
    page,
    request,
  }) => {
    const host = new URL(origin).host;
    // Bloqueada (los fallos del test anterior pueden haber caducado o no).
    for (let i = 0; i < 6; i++) {
      await request.post(`${API_URL}/auth/login`, {
        headers: { 'X-Tenant-Host': host },
        data: { email: doctora.email, password: WRONG },
      });
    }
    const blocked = await request.post(`${API_URL}/auth/login`, {
      headers: { 'X-Tenant-Host': host },
      data: { email: doctora.email, password: PASSWORD },
    });
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);

    await loginAs(page, origin, clinic.email, PASSWORD);
    await page.goto(`${origin}/staff`);
    await page.getByRole('link', { name: new RegExp(doctora.fullName) }).first().click();
    await expect(page.getByText(/Inicio de sesión bloqueado por intentos fallidos/)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Desbloquear inicio de sesión' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`${doctora.fullName} podrá volver a iniciar sesión`);
    await dialog.getByRole('button', { name: 'Sí, desbloquear' }).click();
    await expect(page.getByText(/Inicio de sesión bloqueado por intentos fallidos/)).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Desbloquear inicio de sesión' })).toBeHidden();

    const after = await request.post(`${API_URL}/auth/login`, {
      headers: { 'X-Tenant-Host': host },
      data: { email: doctora.email, password: PASSWORD },
    });
    expect(after.status()).toBe(201);
  });
});

/**
 * DX-213 (SEC-038): el contador es por CUENTA. El ADMIN de la clínica A no
 * puede borrarlo si la cuenta da acceso a otra clínica (409, el mensaje sale
 * tal cual junto al botón) ni ofrece desbloquear a quien está desactivado en
 * A (la API manda `loginBlockedUntil: null`). A 390 y 1440 px, claro y oscuro.
 */
test.describe('desbloqueo del login: cuentas con acceso a otra clínica', () => {
  const suffix = randomUUID().slice(0, 8);
  const OTHER_CLINIC =
    'Esta cuenta da acceso a otra clínica: pide a la persona que espere unos minutos o que restablezca su contraseña';
  const clinicA = {
    subdomain: `desbloqueo-a-${suffix}`,
    clinicName: `Clínica Desbloqueo A ${suffix}`,
    fullName: 'Dueña A',
    email: `desbloqueo-a.${suffix}@example.com`,
    password: PASSWORD,
  };
  const clinicB = {
    subdomain: `desbloqueo-b-${suffix}`,
    clinicName: `Clínica Desbloqueo B ${suffix}`,
    fullName: 'Dueño B',
    email: `desbloqueo-b.${suffix}@example.com`,
    password: PASSWORD,
  };
  const compartida = {
    fullName: 'Doctora Compartida',
    email: `compartida.${suffix}@example.com`,
    role: 'DENTIST',
    password: PASSWORD,
  };
  const desactivada = {
    fullName: 'Doctora Desactivada',
    email: `desactivada.${suffix}@example.com`,
    role: 'DENTIST',
    password: PASSWORD,
  };
  let originA = '';
  let originB = '';
  const ids: Record<string, string> = {};

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    const adminA = await registerClinicViaApi(api, clinicA);
    const adminB = await registerClinicViaApi(api, clinicB);
    originA = adminA.origin;
    originB = adminB.origin;
    for (const person of [compartida, desactivada]) {
      await addStaffViaApi(api, adminA, person);
      await addStaffViaApi(api, adminB, person);
    }
    const staff = await api.get(`${API_URL}/staff`, { headers: adminA.headers });
    const members = (await staff.json()) as { userId: string; email: string }[];
    for (const person of [compartida, desactivada]) {
      ids[person.email] = members.find((m) => m.email === person.email)!.userId;
    }
    const res = await api.delete(`${API_URL}/staff/${ids[desactivada.email]}`, {
      headers: adminA.headers,
    });
    expect(res.status()).toBe(204);
    await api.dispose();
  });

  async function lock(request: APIRequestContext, email: string, origin: string) {
    const host = new URL(origin).host;
    for (let i = 0; i < 6; i++) {
      await request.post(`${API_URL}/auth/login`, {
        headers: { 'X-Tenant-Host': host },
        data: { email, password: WRONG },
      });
    }
    const blocked = await request.post(`${API_URL}/auth/login`, {
      headers: { 'X-Tenant-Host': host },
      data: { email, password: PASSWORD },
    });
    expect(blocked.status()).toBe(429);
  }

  async function openProfile(page: Page, person: { email: string; fullName: string }) {
    await page.goto(`${originA}/staff/${ids[person.email]}`);
    await expect(page.getByRole('heading', { name: person.fullName })).toBeVisible({
      timeout: 15_000,
    });
  }

  for (const viewport of [
    { width: 390, height: 844, scheme: 'light' as const },
    { width: 1440, height: 900, scheme: 'dark' as const },
  ]) {
    test(`${viewport.width} px (${viewport.scheme}): con acceso a otra clínica muestra el 409 tal cual y la cuenta sigue en espera`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: viewport.scheme });
      await lock(request, compartida.email, originA);

      await loginAs(page, originA, clinicA.email, PASSWORD);
      await openProfile(page, compartida);
      await expect(page.getByText(/Inicio de sesión bloqueado por intentos fallidos/)).toBeVisible();
      await page.getByRole('button', { name: 'Desbloquear inicio de sesión' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Sí, desbloquear' }).click();

      await expect(page.getByRole('alert').filter({ hasText: OTHER_CLINIC })).toBeVisible();
      await expect(page.getByRole('dialog')).toBeHidden();
      // La pantalla sigue entera.
      await expect(page.getByLabel('Nombre completo')).toHaveValue(compartida.fullName);
      await expect(page.getByText(/Inicio de sesión bloqueado por intentos fallidos/)).toBeVisible();
      await expectNoHorizontalScroll(page);

      // El contador no se tocó: sigue esperando también en la otra clínica.
      const still = await request.post(`${API_URL}/auth/login`, {
        headers: { 'X-Tenant-Host': new URL(originB).host },
        data: { email: compartida.email, password: PASSWORD },
      });
      expect(still.status()).toBe(429);
    });
  }

  test('un perfil desactivado no muestra la espera ni ofrece desbloquear', async ({ page, request }) => {
    // Sigue activa en B: allí falla y queda en espera.
    await lock(request, desactivada.email, originB);

    await loginAs(page, originA, clinicA.email, PASSWORD);
    await openProfile(page, desactivada);
    await expect(page.getByText('Inactivo')).toBeVisible();
    await expect(page.getByText(/Inicio de sesión bloqueado por intentos fallidos/)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Desbloquear inicio de sesión' })).toBeHidden();
  });
});

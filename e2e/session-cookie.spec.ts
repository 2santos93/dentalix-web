import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { accessTokenOf, registerAndLogin, SESSION_COOKIE, sessionCookie } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * DX-062 — Sesión web: refresh en cookie HttpOnly del host de la clínica,
 * access token solo en memoria y CSP con nonce.
 *
 * La web llama a la API por su MISMO origen (`<clínica>/api/v1`, reescrito por
 * Next hacia la API), así que la cookie es del host de la clínica. Lo que aquí
 * se comprueba en Chromium real:
 * - nada de tokens en localStorage/sessionStorage;
 * - la cookie es HttpOnly, SameSite=Strict, Path=/api/v1/auth y host-only;
 * - recargar mantiene la sesión; cerrar sesión borra la cookie y revoca;
 * - la sesión no viaja a otra clínica;
 * - un usuario con la sesión antigua en localStorage migra a la cookie;
 * - el HTML lleva una CSP con nonce y los scripts de Next lo llevan;
 * - logo de la clínica y avatar (servidos por la API) cargan con la CSP.
 */

const PASSWORD = 'Password123!';

function newClinic(tag: string) {
  const suffix = `${tag}${randomUUID().slice(0, 8)}`;
  return {
    subdomain: `sesion-${suffix}`,
    clinicName: `Sesión ${suffix}`,
    fullName: 'Dueña Sesión',
    email: `sesion.${suffix}@example.com`,
    password: PASSWORD,
  };
}

/** Todo lo que hay en localStorage y sessionStorage, como texto. */
async function browserStorage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dump = (s: Storage) =>
      Array.from({ length: s.length }, (_, i) => {
        const key = s.key(i) as string;
        return `${key}=${s.getItem(key)}`;
      }).join('\n');
    return `${dump(localStorage)}\n${dump(sessionStorage)}`;
  });
}

const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

test('ni el access ni el refresh quedan en el almacenamiento del navegador; el refresh va en una cookie HttpOnly del host', async ({
  page,
}) => {
  const clinic = newClinic('alm');
  const origin = await registerAndLogin(page, clinic);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });

  const storage = await browserStorage(page);
  expect(storage).not.toMatch(JWT);
  expect(storage).not.toContain('refreshToken');
  expect(storage).not.toContain('accessToken');

  const cookie = await sessionCookie(page, origin);
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api/v1/auth',
    // Host-only: del host de la clínica, sin Domain amplio.
    domain: new URL(origin).hostname,
  });
  // JavaScript no la ve.
  expect(await page.evaluate(() => document.cookie)).not.toContain(SESSION_COOKIE);
});

test('recargar mantiene la sesión; cerrar sesión borra la cookie y el refresh anterior da 401', async ({
  page,
}) => {
  const clinic = newClinic('rec');
  const origin = await registerAndLogin(page, clinic);
  await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
  expect(page.url()).toBe(`${origin}/patients`);

  // Una pestaña nueva (como la imprimible) también recupera la sesión.
  const second = await page.context().newPage();
  await second.goto(`${origin}/agenda`);
  await expect(second).toHaveURL(`${origin}/agenda`);
  await expect(second.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 15_000 });
  await second.close();

  const before = (await sessionCookie(page, origin))?.value;
  expect(before).toBeTruthy();

  await page.getByRole('button', { name: new RegExp(clinic.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });

  expect(await sessionCookie(page, origin)).toBeUndefined();
  const reuse = await page.request.post(`${API_URL}/auth/refresh`, {
    data: { refreshToken: before },
  });
  expect(reuse.status()).toBe(401);
  // Tampoco por el camino del navegador (cookie al proxy de la web), por si
  // alguien la hubiera copiado antes del logout (DX-070: FE-003 fue un logout
  // que borraba la cookie pero no revocaba el refresh en la API).
  const reuseByCookie = await page.request.post(
    `http://localhost:${new URL(origin).port}/api/v1/auth/refresh`,
    {
      headers: {
        Origin: origin,
        'X-Tenant-Host': new URL(origin).host,
        Cookie: `${SESSION_COOKIE}=${before}`,
      },
    },
  );
  expect(reuseByCookie.status()).toBe(401);

  // Y sin cookie, volver a una pantalla de la app manda a /login.
  await page.goto(`${origin}/patients`);
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });
});

test('la sesión de una clínica no sirve en otra (cookie por host y refresh validado por clínica)', async ({
  page,
}) => {
  const clinicA = newClinic('a');
  const originA = await registerAndLogin(page, clinicA);
  const otherOrigin = tenantOrigin(`otra-${randomUUID().slice(0, 8)}`);

  // El navegador no manda la cookie de A al host de otra clínica.
  expect(await sessionCookie(page, otherOrigin)).toBeUndefined();
  await page.goto(`${otherOrigin}/patients`);
  await expect(page).toHaveURL(`${otherOrigin}/login`, { timeout: 10_000 });

  // Aunque alguien la copie a mano al host de otra clínica, la API la rechaza.
  const clinicB = newClinic('b');
  const register = await page.request.post(`${API_URL}/auth/register`, {
    data: clinicB,
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const originB = tenantOrigin(clinicB.subdomain);
  const cookieA = (await sessionCookie(page, originA))?.value as string;
  // Por el proxy de la web (localhost:<puerto>, con el host de B en cabecera:
  // Node no resuelve *.localhost como Chromium).
  const crossed = await page.request.post(
    `http://localhost:${new URL(originB).port}/api/v1/auth/refresh`,
    {
      headers: {
        Origin: originB,
        'X-Tenant-Host': new URL(originB).host,
        Cookie: `${SESSION_COOKIE}=${cookieA}`,
      },
    },
  );
  expect(crossed.status()).toBe(401);
  // Y en su propia clínica la sesión sigue viva (el 401 no la consumió).
  await page.goto(`${originA}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
});

test('migración: una sesión antigua en localStorage pasa a la cookie y se borra', async ({ page }) => {
  const clinic = newClinic('mig');
  const origin = await registerAndLogin(page, clinic);
  // Sesión "de antes": el par completo, como lo dejaba la web previa a DX-062.
  await page.context().clearCookies();
  const login = await page.request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': new URL(origin).host },
    data: { email: clinic.email, password: clinic.password },
  });
  expect(login.ok()).toBeTruthy();
  const legacy = (await login.json()) as { accessToken: string; refreshToken: string };
  expect(legacy.refreshToken).toBeTruthy();

  await page.goto(`${origin}/login`);
  await page.evaluate(
    (pair) =>
      localStorage.setItem('dentalix-auth', JSON.stringify({ state: pair, version: 0 })),
    legacy,
  );

  await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('dentalix-auth'))).toBeNull();
  expect((await sessionCookie(page, origin))?.httpOnly).toBe(true);
  // El refresh antiguo se usó una vez (un solo uso): ya no sirve.
  const reuse = await page.request.post(`${API_URL}/auth/refresh`, {
    data: { refreshToken: legacy.refreshToken },
  });
  expect(reuse.status()).toBe(401);
});

test('el HTML lleva una CSP con nonce y los scripts de Next lo usan', async ({ page }) => {
  const res = await page.goto(tenantOrigin(`csp-${randomUUID().slice(0, 8)}`) + '/login');
  const csp = res?.headers()['content-security-policy'] ?? '';
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  if (process.env.E2E_EXPECT_PROD_CSP === '1') {
    // `next build && next start`: React no necesita eval en producción.
    expect(csp).not.toContain('unsafe-eval');
  }
  // Todos los <script> del HTML servido llevan el nonce de ESTA respuesta (los
  // chunks que Next carga después heredan la confianza por 'strict-dynamic').
  const html = (await res?.text()) ?? '';
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
});

// PNG de 1×1 válido (para que el <img> tenga naturalWidth > 0).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'base64',
);

async function imageLoaded(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((img) => {
    const el = img as HTMLImageElement;
    return el.complete && el.naturalWidth > 0;
  });
}

test('el avatar y el logo de la clínica (servidos por la API) cargan con la CSP', async ({ page }) => {
  const clinic = newClinic('img');
  const origin = await registerAndLogin(page, clinic);
  const accessToken = await accessTokenOf(page);
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host };

  const upload = await page.request.post(`${API_URL}/me/avatar`, {
    headers,
    multipart: { file: { name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1X1 } },
  });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const { avatarUrl } = (await upload.json()) as { avatarUrl: string };
  expect(new URL(avatarUrl).origin).toBe(new URL(API_URL).origin);

  // Avatar en el menú de cuenta.
  await page.goto(`${origin}/patients`);
  const avatar = `img[src="${avatarUrl}"]`;
  await expect(page.locator(avatar).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => imageLoaded(page, avatar)).toBe(true);

  // Logo de la clínica en la imprimible. No hay endpoint para fijarlo (se
  // carga en la BD), así que se fija directamente en la base de test.
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede fijar el logo de la clínica');
  execFileSync('psql', [
    databaseUrl as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE tenants SET "logoUrl" = '${avatarUrl}' WHERE subdomain = '${clinic.subdomain}'`,
  ]);
  const patient = await page.request.post(`${API_URL}/patients`, {
    headers,
    data: { firstName: 'Logo', lastName: 'Clínica', docType: 'CC', docNumber: `LG${Date.now()}`, sex: 'F' },
  });
  expect(patient.ok(), await patient.text()).toBeTruthy();
  const { id } = (await patient.json()) as { id: string };

  await page.goto(`${origin}/print/patients/${id}/account-statement`);
  const logo = `img[alt="${clinic.clinicName}"]`;
  await expect(page.locator(logo)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => imageLoaded(page, logo)).toBe(true);
});

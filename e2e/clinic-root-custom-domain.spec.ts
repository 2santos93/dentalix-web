import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { registerClinicViaApi } from './support/api';
import { WEB_PORT } from './support/urls';

/**
 * e2e (DX-554): en un DOMINIO PROPIO «/» es la entrada de la clínica, nunca la
 * landing de Dentalix. Verificado: lleva al login con su marca. Sin verificar
 * (o desconocido): tampoco la landing; va al login sin marca. Solo sin sesión:
 * el login en un dominio propio depende de DX-094.
 *
 * Como branding-ssr-custom-domain.spec.ts: el dominio se da por verificado en
 * la BD (psql con E2E_DATABASE_URL) y Chromium lo resuelve a 127.0.0.1.
 * Fichero aparte: `launchOptions` vale para todo el fichero.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `entrada-dom-${suffix}`;
const clinicName = `Clínica Dominio ${suffix}`;
const verifiedHost = `entrada-${suffix}.test`;
const unverifiedHost = `sin-verificar-${suffix}.test`;
/** El H1 de la landing de marketing (landing-page.tsx). */
const LANDING_TITLE = 'El software que mantiene tu clínica dental al día.';

test.use({
  launchOptions: {
    args: [`--host-resolver-rules=MAP ${verifiedHost} 127.0.0.1, MAP ${unverifiedHost} 127.0.0.1`],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  },
});

test('dominio propio verificado: «/» lleva al login con la marca de la clínica, sin la landing', async ({ page, request }) => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede dar por verificado un dominio propio');

  await registerClinicViaApi(request, {
    subdomain,
    clinicName,
    fullName: 'Dra. Dominio',
    email: `entrada.${subdomain}@example.com`,
    password: 'Password123!',
  });
  execFileSync('psql', [
    databaseUrl as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO tenant_domains (id, "tenantId", host, status, "verifyToken", "verifiedAt", "expiresAt", "updatedAt")
     SELECT gen_random_uuid(), id, '${verifiedHost}', 'VERIFIED', 'e2e-dx554', now(), NULL, now()
     FROM tenants WHERE subdomain = '${subdomain}'`,
  ]);

  // El HTML de «/» con el `Host` del dominio propio (la petición de Node no
  // usa `--host-resolver-rules`): la marca de la clínica, nunca la landing.
  const res = await page.request.get(`http://127.0.0.1:${WEB_PORT}/`, {
    headers: { Host: `${verifiedHost}:${WEB_PORT}` },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(clinicName);
  expect(html).not.toContain(LANDING_TITLE);
  expect(html).toContain('noindex');

  const origin = `http://${verifiedHost}:${WEB_PORT}`;
  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole('heading', { level: 1, name: clinicName })).toBeVisible();
  await expect(page.getByRole('heading', { name: LANDING_TITLE })).toHaveCount(0);
});

test('dominio propio sin verificar: «/» nunca muestra la landing de Dentalix', async ({ page }) => {
  const res = await page.request.get(`http://127.0.0.1:${WEB_PORT}/`, {
    headers: { Host: `${unverifiedHost}:${WEB_PORT}` },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain(LANDING_TITLE);

  const origin = `http://${unverifiedHost}:${WEB_PORT}`;
  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole('heading', { name: LANDING_TITLE })).toHaveCount(0);
});

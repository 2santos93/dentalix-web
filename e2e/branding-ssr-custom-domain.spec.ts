import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Request } from './support/test';
import { registerClinicViaApi } from './support/api';
import { API_URL, WEB_PORT } from './support/urls';

/**
 * e2e (DX-517-ter): en un DOMINIO PROPIO verificado la marca también sale en
 * el primer HTML del servidor (antes el servidor no podía saberla y la pedía
 * el navegador: parpadeo y remontaje). Solo GET y sin sesión: el login en un
 * dominio propio depende de DX-094.
 *
 * El dominio se da por verificado en la BD (psql con E2E_DATABASE_URL, como
 * break-glass.spec.ts) y Chromium lo resuelve a 127.0.0.1. Fichero aparte:
 * `launchOptions` vale para todo el fichero.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `marca-dom-${suffix}`;
const clinicName = `Clínica Propia ${suffix}`;
const color = '#B45309';
const customHost = `clinica-${suffix}.test`;
const origin = `http://${customHost}:${WEB_PORT}`;

test.use({
  launchOptions: {
    args: [`--host-resolver-rules=MAP ${customHost} 127.0.0.1`],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  },
});

test('dominio propio verificado: la marca va en el primer HTML y el navegador no la pide', async ({ page, request }) => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede dar por verificado un dominio propio');

  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName,
    fullName: 'Dra. Dominio',
    email: `marca.${subdomain}@example.com`,
    password: 'Password123!',
  });
  const patched = await request.patch(`${API_URL}/clinic/settings`, { headers: session.headers, data: { primaryColor: color } });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  const texts = await request.put(`${API_URL}/exchange/currency-texts`, {
    headers: session.headers,
    data: { entries: [{ currency: 'VES', text: 'Bs.' }] },
  });
  expect(texts.ok(), await texts.text()).toBeTruthy();
  execFileSync('psql', [
    databaseUrl as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO tenant_domains (id, "tenantId", host, status, "verifyToken", "verifiedAt", "expiresAt", "updatedAt")
     SELECT gen_random_uuid(), id, '${customHost}', 'VERIFIED', 'e2e-dx517ter', now(), NULL, now()
     FROM tenants WHERE subdomain = '${subdomain}'`,
  ]);

  // El primer HTML, sin JavaScript, ya trae nombre y acento. `--host-resolver-rules`
  // solo vale para Chromium: la petición de Playwright (Node) no resuelve el
  // dominio, así que va a 127.0.0.1 con el `Host` del dominio propio, que es
  // lo único que ve Next (y lo que manda a la API como `?host=`).
  const res = await page.request.get(`http://127.0.0.1:${WEB_PORT}/login`, {
    headers: { Host: `${customHost}:${WEB_PORT}` },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html.slice(0, html.indexOf('</head>'))).toContain(`--color-primary:${color}`);
  expect(html).toContain(clinicName);

  const fetches: Request[] = [];
  page.on('request', (req) => {
    if (/\/public\/tenant\/branding\/?$/.test(new URL(req.url()).pathname)) fetches.push(req);
  });
  // El navegador, en cambio, sí va al dominio propio (resuelto a 127.0.0.1).
  await page.goto(`${origin}/login`);
  expect(new URL(page.url()).host).toBe(`${customHost}:${WEB_PORT}`);
  const heading = page.getByRole('heading', { level: 1, name: clinicName });
  await expect(heading).toBeVisible();
  const handle = await heading.elementHandle();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
  expect(fetches.map((r) => r.url())).toEqual([]);
});

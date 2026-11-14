import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type Request } from './support/test';
import { registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-517-ter): la marca de la clínica sale en el PRIMER HTML del
 * servidor en su subdominio (`*.localhost`, como la CI), sin que el navegador
 * la vuelva a pedir y sin volver a montar el árbol. Y nadie puede suplantarla
 * con cabeceras: la API la elige por el `Host` que recibió la web.
 *
 * Dos clínicas nuevas por corrida, A y B, cada una con su color y con textos
 * de moneda (VES → «Bs.», el disparador del remontaje de antes).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const A = { subdomain: `marca-a-${suffix}`, clinicName: `Clínica Ávila ${suffix}`, color: '#7C3AED' };
const B = { subdomain: `marca-b-${suffix}`, clinicName: `Clínica Norte ${suffix}`, color: '#15803D' };

async function brand(request: Parameters<typeof registerClinicViaApi>[0], session: ApiSession, color: string) {
  const settings = await request.patch(`${API_URL}/clinic/settings`, { headers: session.headers, data: { primaryColor: color } });
  expect(settings.ok(), `PATCH /clinic/settings falló: ${await settings.text()}`).toBeTruthy();
  const texts = await request.put(`${API_URL}/exchange/currency-texts`, {
    headers: session.headers,
    data: { entries: [{ currency: 'VES', text: 'Bs.' }] },
  });
  expect(texts.ok(), `PUT /exchange/currency-texts falló: ${await texts.text()}`).toBeTruthy();
}

test.beforeAll(async ({ request }) => {
  for (const c of [A, B]) {
    const session = await registerClinicViaApi(request, {
      subdomain: c.subdomain,
      clinicName: c.clinicName,
      fullName: 'Dra. Marca',
      email: `marca.${c.subdomain}@example.com`,
      password,
    });
    await brand(request, session, c.color);
  }
});

/** Peticiones del NAVEGADOR a la marca (la del servidor no pasa por aquí). */
function watchBrowserBrandingFetches(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (/\/public\/tenant\/branding(?:\/by-host)?\/?$/.test(new URL(req.url()).pathname)) seen.push(req);
  });
  return seen;
}

/** El `<head>` y el cuerpo del primer HTML, tal cual lo mandó el servidor. */
async function firstHtml(page: Page, url: string, headers?: Record<string, string>) {
  const res = await page.request.get(url, { headers });
  expect(res.status()).toBe(200);
  const html = await res.text();
  const head = html.slice(0, html.indexOf('</head>'));
  return { html, head, cacheControl: res.headers()['cache-control'] ?? '' };
}

test('subdominio: la marca va en el primer HTML, el navegador no la pide y el árbol no se monta dos veces', async ({ page }) => {
  const origin = tenantOrigin(A.subdomain);
  const { html, head, cacheControl } = await firstHtml(page, `${origin}/login`);
  expect(head).toContain(`--color-primary:${A.color}`);
  expect(html).toContain(A.clinicName);
  // El HTML es por petición (nonce de la CSP): nunca cacheable por terceros.
  expect(cacheControl).toMatch(/no-store/);

  const fetches = watchBrowserBrandingFetches(page);
  await page.goto(`${origin}/login`);
  const heading = page.getByRole('heading', { level: 1, name: A.clinicName });
  await expect(heading).toBeVisible();
  const handle = await heading.elementHandle();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await page.getByTestId('client-accent').count()).toBe(0);
  expect(fetches.map((r) => r.url())).toEqual([]);
});

test('suplantación: X-Forwarded-Host, X-Tenant-Host y X-Tenant de B no cambian la marca del host de A', async ({ page }) => {
  const forged = {
    'X-Forwarded-Host': `${B.subdomain}.localhost`,
    'X-Tenant-Host': `${B.subdomain}.localhost`,
    'X-Tenant': B.subdomain,
  };
  const { html, head } = await firstHtml(page, `${tenantOrigin(A.subdomain)}/login`, forged);
  expect(head).toContain(`--color-primary:${A.color}`);
  expect(html).toContain(A.clinicName);
  expect(html).not.toContain(B.clinicName);
  expect(head).not.toContain(`--color-primary:${B.color}`);

  await page.setExtraHTTPHeaders(forged);
  await page.goto(`${tenantOrigin(A.subdomain)}/login`);
  await expect(page.getByRole('heading', { level: 1, name: A.clinicName })).toBeVisible();
});

test('A y luego B en el mismo contexto: cada una con la suya, sin rastro de A en B', async ({ page }) => {
  const a = await firstHtml(page, `${tenantOrigin(A.subdomain)}/login`);
  const b = await firstHtml(page, `${tenantOrigin(B.subdomain)}/login`);
  const a2 = await firstHtml(page, `${tenantOrigin(A.subdomain)}/login`);
  expect(a.html).toContain(A.clinicName);
  expect(b.html).toContain(B.clinicName);
  expect(b.html).not.toContain(A.clinicName);
  expect(b.head).not.toContain(`--color-primary:${A.color}`);
  expect(a2.html).toContain(A.clinicName);
  expect(a2.html).not.toContain(B.clinicName);

  await page.goto(`${tenantOrigin(A.subdomain)}/login`);
  await expect(page.getByRole('heading', { level: 1, name: A.clinicName })).toBeVisible();
  await page.goto(`${tenantOrigin(B.subdomain)}/login`);
  await expect(page.getByRole('heading', { level: 1, name: B.clinicName })).toBeVisible();
});

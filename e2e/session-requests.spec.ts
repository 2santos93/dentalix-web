import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { tenantOrigin } from './support/urls';

/**
 * e2e FE-031 (DX-117): con el shell montado y «Caja» abierta, la web pide
 * `GET /me` y `GET /locations` UNA vez cada uno. Antes el shell montaba el
 * menú de cuenta y el selector de sede dos veces (barra lateral y barra del
 * teléfono, una de ellas oculta) y cada pantalla leía las sedes por su cuenta.
 *
 * Una clínica nueva por corrida (una sede). Se cuenta desde una carga completa
 * de Inicio (`page.goto`, documento nuevo: la caché de sesión en memoria
 * arranca vacía), no desde el login: así lo medido es el shell + «Caja» y no
 * lo que pida la pantalla de login antes de entrar. De Inicio a «Caja» se va
 * por la navegación de la app (barra lateral; en el teléfono, la barra
 * inferior o la hoja «Más»), sin recargar. DX-298: cada prueba corre a
 * 1440 y a 390 px dentro del proyecto de escritorio (el proyecto `touch` solo
 * ejecuta el spec de objetivos táctiles, DX-485).
 *
 * DX-298 (FE-031, FE-073): de Inicio se recorren 5 pantallas más por la
 * navegación de la app; `GET /me` sigue en 1 y `GET /work-queues/summary` (los
 * contadores del menú y «Mi día») no se repite al cambiar de pantalla: solo el
 * sondeo de cada minuto puede sumar una lectura.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sesion-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Sesión', email: `ana.ses.${suffix}@example.com` };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sesión ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
});

/** Abre una sección con la navegación de la app, según el ancho. */
async function openSection(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 768) {
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name, exact: true }).click();
    return;
  }
  const bottomBar = page.getByRole('navigation', { name: 'Principal' });
  await expect(bottomBar).toBeVisible({ timeout: 15_000 });
  const tab = bottomBar.getByRole('link', { name, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await bottomBar.getByRole('button', { name: 'Más', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Más' })
    .getByRole('navigation', { name: 'Más' })
    .getByRole('link', { name, exact: true })
    .click();
}

/** Los dos anchos que pide DX-298: escritorio y teléfono. */
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

for (const viewport of WIDTHS) {
  test(`shell + «Caja» a ${viewport.width} px: un GET /me y un GET /locations`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);

    const reads = { me: 0, locations: 0 };
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const { pathname } = new URL(req.url());
      if (pathname.endsWith('/api/v1/me')) reads.me++;
      if (pathname.endsWith('/api/v1/locations')) reads.locations++;
    });

    await page.goto(`${origin}/dashboard`);
    // El shell ya pintó la cuenta (necesita `/me`) y el selector de sede (`/locations`).
    await expect(page.locator('select[data-location-switcher]').first()).toBeAttached({ timeout: 15_000 });
    await expect.poll(() => reads.me).toBe(1);

    await openSection(page, 'Caja');
    await expect(page).toHaveURL(`${origin}/caja`);
    await expect(page.getByRole('heading', { level: 1, name: 'Caja' })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    expect(reads.me, 'GET /api/v1/me tras montar el shell y abrir «Caja»').toBe(1);
    expect(reads.locations, 'GET /api/v1/locations tras montar el shell y abrir «Caja»').toBe(1);
  });

  test(`DX-298 a ${viewport.width} px: Inicio y 5 pantallas más, un GET /me y ninguna lectura de /work-queues/summary por navegar`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);

    const reads = { me: 0, summary: 0 };
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const { pathname } = new URL(req.url());
      if (pathname.endsWith('/api/v1/me')) reads.me++;
      if (pathname.endsWith('/api/v1/work-queues/summary')) reads.summary++;
    });

    await page.goto(`${origin}/dashboard`);
    await expect(page.locator('select[data-location-switcher]').first()).toBeAttached({ timeout: 15_000 });
    await expect.poll(() => reads.summary).toBe(1);
    const started = Date.now();

    for (const [name, path] of [
      ['Agenda', '/agenda'],
      ['Pacientes', '/patients'],
      ['Presupuestos', '/presupuestos'],
      ['Caja', '/caja'],
      ['Reportes', '/reportes'],
    ] as const) {
      await openSection(page, name);
      await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
      await page.waitForLoadState('networkidle');
    }

    expect(reads.me, 'GET /api/v1/me tras Inicio y 5 pantallas').toBe(1);
    // El sondeo de cada minuto es la única lectura que puede sumarse.
    const polls = Math.floor((Date.now() - started) / 60_000);
    expect(reads.summary, 'GET /api/v1/work-queues/summary tras Inicio y 5 pantallas').toBeLessThanOrEqual(1 + polls);
  });
}

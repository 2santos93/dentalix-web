import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page, type Route } from './support/test';
import { loginAs } from './support/auth';
import { tenantOrigin } from './support/urls';

/**
 * e2e (DX-063): con la API respondiendo un 500 «Internal server error», las
 * pantallas de Pacientes, Catálogo y Caja dicen qué falló EN ESPAÑOL, en su
 * estado de sección (escalón 1) y con «Reintentar»; al reintentar con la API
 * ya sana, la pantalla carga. El catálogo de la clínica demo (venezolana, en
 * USD) pinta los precios en la moneda de la clínica (USD), nunca en otra. Escritorio (1440px) y móvil (390px).
 *
 * El fallo se fuerza interceptando la petición del navegador con `page.route`
 * (mismo origen, `/api/v1/...`), así no hace falta romper la API real.
 * Capturas: en el `outputDir` del test, o en `E2E_QA_DIR` si se define.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const INTERNAL_ERROR = {
  status: 500,
  contentType: 'application/json',
  body: JSON.stringify({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Internal server error',
    requestId: 'req-e2e-dx063',
  }),
};

interface Screen {
  name: string;
  path: string;
  /** Ruta de la API (sin query) de la carga principal de la pantalla. */
  apiPath: string;
  message: string;
  /** Lo que aparece cuando la carga se recupera (también en móvil, sin tabla). */
  loaded: (page: Page) => Locator;
}

const SCREENS: Screen[] = [
  {
    name: 'pacientes',
    path: '/patients',
    apiPath: '/api/v1/patients',
    message: 'No pudimos cargar los pacientes.',
    loaded: (page) => page.getByText(/^\d+ pacientes?$/),
  },
  {
    name: 'catalogo',
    path: '/catalog',
    apiPath: '/api/v1/catalog/items/directory',
    message: 'No pudimos cargar el catálogo.',
    loaded: (page) => page.getByText(/^\d+ ítems?$/),
  },
  {
    name: 'caja',
    path: '/caja',
    apiPath: '/api/v1/payments',
    message: 'No pudimos cargar la caja.',
    loaded: (page) => page.getByText(/^\d+ abonos?$/),
  },
];

async function screenshot(page: Page, file: string, fallbackDir: string) {
  const dir = process.env.E2E_QA_DIR ?? fallbackDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, file), fullPage: true });
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`un 500 en pacientes, catálogo y caja se explica en español con reintento (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    await loginAs(page, origin, ADMIN_EMAIL, DEMO_PASSWORD);

    for (const screen of SCREENS) {
      let failing = true;
      const handler = (route: Route) =>
        failing ? route.fulfill(INTERNAL_ERROR) : route.fallback();
      const matcher = (url: URL) => url.pathname === screen.apiPath;
      await page.route(matcher, handler);

      await page.goto(`${origin}${screen.path}`);
      const alert = page.getByRole('alert').filter({ hasText: screen.message });
      await expect(alert).toBeVisible();
      // Nada del texto técnico del servidor ni de su requestId.
      await expect(page.getByText(/internal server error|request failed|req-e2e-dx063/i)).toHaveCount(0);
      const retry = alert.getByRole('button', { name: 'Reintentar' });
      await expect(retry).toBeVisible();

      // Sin scroll horizontal también en el estado de error.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await screenshot(
        page,
        `${screen.name}-500-${viewport.width}.png`,
        testInfo.outputPath('qa'),
      );

      failing = false;
      await retry.click();
      await expect(screen.loaded(page).first()).toBeVisible();
      await expect(alert).toHaveCount(0);
      await page.unroute(matcher, handler);

      if (screen.name === 'catalogo') {
        // La clínica demo trabaja en USD: precios en su moneda con el código
        // ISO («450,00 USD», DX-378: nunca «US$»), nunca en la de otro país.
        await expect(page.getByText(/\d\sUSD$/).first()).toBeVisible();
        await expect(page.getByText(/US\$/)).toHaveCount(0);
        await expect(page.getByText(/\d\s(?:COP|EUR|€|VES|Bs)/)).toHaveCount(0);
        await screenshot(page, `catalogo-usd-${viewport.width}.png`, testInfo.outputPath('qa'));
      }
    }
  });
}

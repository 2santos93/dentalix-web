import { mkdirSync } from 'node:fs';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-365 → A4, shell v2). DX-365 arregló el título de la barra superior
 * móvil, que se leía «Dashboar». En el shell v2 la barra superior del teléfono
 * ya no lleva título (lleva la marca de la clínica, la sede, la búsqueda y la
 * cuenta): el título es el H1 de cada pantalla, y la navegación es una barra
 * inferior con cuatro destinos con etiqueta + «Más».
 *
 * Contra la clínica DEMO (dos sedes: el selector se ve, que es el peor caso),
 * como ADMIN (el menú más largo), solo lectura. Por cada ruta, a 320 y 390 px
 * y en claro y oscuro:
 *   - el H1 de la página se ve;
 *   - la barra superior no desborda y la página no tiene scroll horizontal;
 *   - la barra inferior tiene 5 controles, cada uno con su etiqueta entera.
 * A 1440 px las barras del teléfono no se ven y el sidebar sigue a 240 px.
 * Capturas en E2E_QA_DIR si está definido: `topbar-${ruta}-${ancho}-${tema}.png`.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const QA_DIR = process.env.E2E_QA_DIR;

const ROUTES = [
  '/dashboard',
  '/patients',
  '/caja/cartera',
  '/presupuestos',
  '/anamnesis-por-revisar',
  '/reportes',
  '/settings',
  '/settings/auditoria',
  '/settings/profile',
] as const;

const MOBILE_WIDTHS = [320, 390] as const;

test.beforeEach(async ({ page }) => {
  await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

for (const width of MOBILE_WIDTHS) {
  test(`móvil (${width} px): H1 visible, barra superior sin desbordar y barra inferior con etiquetas, claro y oscuro`, async ({
    page,
  }) => {
    if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
    await page.setViewportSize({ width, height: 844 });
    for (const path of ROUTES) {
      await page.goto(`${origin}${path}`);
      const banner = page.getByRole('banner');
      const tabs = page.getByTestId('bottom-tab-bar');
      // El menú está resuelto cuando aparece la pestaña de ADMIN «Inicio».
      await expect(tabs.getByRole('link', { name: 'Inicio' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('main').getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
        const where = `${path} a ${width} px (${scheme})`;
        const row = await banner.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
        expect(row.scrollWidth, `${where}: la barra superior desborda`).toBeLessThanOrEqual(row.clientWidth);
        await expectNoHorizontalScroll(page);

        // Cinco controles con su etiqueta entera (ninguna se corta).
        const controls = tabs.locator('a, button');
        await expect(controls, where).toHaveCount(5);
        const cut = await controls.evaluateAll((els) =>
          els
            .map((el) => el.querySelector('span:last-child') as HTMLElement)
            .filter((label) => label.scrollWidth > label.clientWidth)
            .map((label) => label.innerText),
        );
        expect(cut, `${where}: etiquetas cortadas`).toEqual([]);

        if (QA_DIR) {
          await page.mouse.move(0, 0);
          await page.evaluate(() =>
            Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
          );
          const slug = path.replace(/^\//, '').replace(/\//g, '-');
          await page.screenshot({ path: `${QA_DIR}/topbar-${slug}-${width}-${scheme}.png`, fullPage: false });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });
}

test('escritorio (1440 px): las barras del teléfono no se ven y el sidebar mide 240 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ROUTES) {
    await page.goto(`${origin}${path}`);
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Inicio' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByTestId('bottom-tab-bar')).toBeHidden();
    const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width, `${path}: ancho del sidebar`).toBe(240);
    // La etiqueta visible es corta; el nombre accesible, el completo.
    await expect(sidebar.getByRole('link', { name: /^Anamnesis (?:\d+ · )?por revisar/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

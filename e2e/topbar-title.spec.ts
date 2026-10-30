import { mkdirSync } from 'node:fs';
import { test, expect, type Locator, type Page } from './support/test';
import { loginAs } from './support/auth';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-365): a 390 px la barra superior móvil leía «Dashboar»: el selector
 * de sede y el avatar dejaban al scroller del menú unos 120 px y el primer
 * enlace quedaba cortado a media palabra.
 *
 * Contra la clínica DEMO (dos sedes: el selector se ve, que es el peor caso),
 * como ADMIN (el menú más largo), solo lectura. Por cada ruta, a 320 y 390 px
 * y en claro y oscuro:
 *   - el título de la sección cabe (scrollWidth <= clientWidth) o se trunca con
 *     elipsis (`text-overflow: ellipsis`) y el texto entero está en `title`;
 *   - la fila del título no desborda y la página no tiene scroll horizontal;
 *   - la fila del menú son iconos: ningún enlace pinta texto que cortar;
 *   - a 390 px «Dashboard» cabe entero (el caso del informe).
 * A 1440 px la barra móvil no se ve y el sidebar sigue como estaba (240 px,
 * con sus etiquetas). Capturas en E2E_QA_DIR si está definido:
 * `topbar-${ruta}-${ancho}-${tema}.png`.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const QA_DIR = process.env.E2E_QA_DIR;

const ROUTES = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/patients', title: 'Pacientes' },
  { path: '/caja/cartera', title: 'Cartera' },
  { path: '/presupuestos', title: 'Presupuestos' },
  { path: '/anamnesis-por-revisar', title: 'Anamnesis por revisar' },
  { path: '/reportes', title: 'Reportes' },
  { path: '/settings', title: 'Ajustes' },
  { path: '/settings/auditoria', title: 'Auditoría' },
  { path: '/settings/profile', title: 'Mi perfil' },
] as const;

const MOBILE_WIDTHS = [320, 390] as const;

interface TitleBox {
  text: string;
  title: string | null;
  scrollWidth: number;
  clientWidth: number;
  textOverflow: string;
  overflow: string;
  whiteSpace: string;
}

function topbarTitle(page: Page): Locator {
  return page.getByRole('banner').getByTestId('topbar-title');
}

async function measure(title: Locator): Promise<TitleBox> {
  return title.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      text: el.textContent ?? '',
      title: el.getAttribute('title'),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      textOverflow: style.textOverflow,
      overflow: style.overflowX,
      whiteSpace: style.whiteSpace,
    };
  });
}

/** Cabe, o se trunca con «…» y el texto entero queda en `title`. */
function expectFitsOrEllipsis(box: TitleBox, expected: string, where: string): void {
  expect(box.text, `${where}: texto del título`).toBe(expected);
  expect(box.title, `${where}: title`).toBe(expected);
  if (box.scrollWidth <= box.clientWidth) return;
  expect(box.textOverflow, `${where}: no cabe y no lleva elipsis`).toBe('ellipsis');
  expect(box.overflow, `${where}: overflow`).toBe('hidden');
  expect(box.whiteSpace, `${where}: white-space`).toBe('nowrap');
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

for (const width of MOBILE_WIDTHS) {
  test(`móvil (${width} px): ningún título de la barra superior se corta a media palabra, claro y oscuro`, async ({
    page,
  }) => {
    if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
    await page.setViewportSize({ width, height: 844 });
    for (const route of ROUTES) {
      await page.goto(`${origin}${route.path}`);
      const banner = page.getByRole('banner');
      const title = topbarTitle(page);
      await expect(title).toHaveText(route.title, { timeout: 30_000 });
      // El menú está resuelto cuando aparece la entrada de ADMIN «Dashboard».
      const nav = banner.getByRole('navigation');
      await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
        const where = `${route.path} a ${width} px (${scheme})`;
        const box = await measure(title);
        expectFitsOrEllipsis(box, route.title, where);
        if (width === 390 && route.title === 'Dashboard') {
          expect(box.scrollWidth, `${where}: «Dashboard» cabe entero`).toBeLessThanOrEqual(box.clientWidth);
        }

        // La fila del título (título + sede + cuenta) no se sale de la barra.
        const row = await title.evaluate((el) => {
          const parent = el.parentElement as HTMLElement;
          return { scrollWidth: parent.scrollWidth, clientWidth: parent.clientWidth };
        });
        expect(row.scrollWidth, `${where}: la fila del título desborda`).toBeLessThanOrEqual(row.clientWidth);
        await expectNoHorizontalScroll(page);

        // El menú móvil es de iconos: ningún enlace pinta texto visible, así
        // que lo que asome en el borde del scroller nunca es media palabra.
        const texts = await nav.getByRole('link').evaluateAll((links) =>
          links.map((a) => (a as HTMLElement).innerText.replace(/\d+/g, '').trim()),
        );
        expect(texts.filter(Boolean), `${where}: enlaces del menú con texto`).toEqual([]);

        if (QA_DIR) {
          await page.mouse.move(0, 0);
          await page.evaluate(() =>
            Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
          );
          const slug = route.path.replace(/^\//, '').replace(/\//g, '-');
          await page.screenshot({ path: `${QA_DIR}/topbar-${slug}-${width}-${scheme}.png`, fullPage: false });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });
}

test('escritorio (1440 px): la barra móvil no se ve y el sidebar no cambia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ROUTES) {
    await page.goto(`${origin}${route.path}`);
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(topbarTitle(page)).toBeHidden();
    // Sidebar expandido de siempre: 240 px y cada entrada con su etiqueta.
    const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width, `${route.path}: ancho del sidebar`).toBe(240);
    await expect(sidebar.getByText('Anamnesis por revisar', { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

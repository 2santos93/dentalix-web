import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { test, expect, type Locator, type Page } from './support/test';
import { loginAs } from './support/auth';
import { registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * DX-347: el menú lateral se desplaza dentro del sidebar a 768 px de alto, con
 * barra overlay (la del sistema en macOS) y con una barra clásica de 15 px.
 * El carril plegado conserva 64 px y 44 px útiles por enlace; el foco, los
 * contadores y la cuenta quedan dentro; axe sin violaciones, claro y oscuro.
 */
const PASSWORD = 'Password123!';

let origin: string;
const admin = { fullName: 'Dueña Barras', email: '' };

test.beforeAll(async ({ playwright }) => {
  const suffix = randomUUID().slice(0, 8);
  admin.email = `barras.admin.${suffix}@example.com`;
  const api = await playwright.request.newContext();
  try {
    const session = await registerClinicViaApi(api, {
      subdomain: `barras-${suffix}`,
      clinicName: `Clínica Barras ${suffix}`,
      fullName: admin.fullName,
      email: admin.email,
      password: PASSWORD,
    });
    origin = session.origin;
  } finally {
    await api.dispose();
  }
});

/** El disparador visible del menú de cuenta en escritorio: tarjeta o rail. */
function accountTrigger(page: Page, fullName: string): Locator {
  return page.getByRole('button', { name: new RegExp(fullName) }).first();
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginAs(page, origin, email, PASSWORD);
  if (!/\/patients$/.test(page.url())) await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 30_000 });
}

// DX-347: macOS usa barras overlay. La pseudo-barra fuerza un gutter real
// de 15 px solo en esta página de QA, sin cambiar preferencias del sistema.
// Playwright oculta las barras por defecto; aquí deben poder ocupar espacio.
// Afecta a todo el fichero (Playwright no admite launchOptions en un describe):
// por eso estas pruebas viven aparte y no cambian las de settings-index.
test.use({ launchOptions: {
  ignoreDefaultArgs: ['--hide-scrollbars'],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
} });
for (const scrollbar of ['native', 'classic'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`ADMIN: navegación a 768 px con barra ${scrollbar} ${colorScheme}, expandida y plegada`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 1366, height: 768 });
      // Solo el contador es sintético; sesión, sedes y navegación usan la API real.
      await page.route('**/medical-history/submissions/summary', (route) =>
        route.fulfill({ json: { submitted: 12 } }));
      await signIn(page, admin.email);
      await expect(page.locator('aside').getByTestId('anamnesis-inbox-count')).toHaveText('12');
      if (scrollbar === 'classic') {
        await page.addStyleTag({ content: `
          aside > nav { scrollbar-width: auto !important; }
          aside > nav::-webkit-scrollbar { width: 15px; }
          aside > nav::-webkit-scrollbar-thumb { background: #737373; }
        ` });
      }
      const nav = page.locator('aside > nav');
      const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
      for (const collapsed of [false, true]) {
        await page.setViewportSize({ width: 1366, height: 768 });
        if (collapsed) await page.getByRole('button', { name: 'Colapsar menú' }).click();
        // Terminar la transición de ancho antes de medir, sin esperas arbitrarias.
        await page.locator('aside').evaluate((el) => {
          for (const animation of el.getAnimations()) animation.finish();
        });
        const links = nav.getByRole('link');
        await expect(links).toHaveCount(15);
        await expect(nav.getByRole('link', { name: 'Anamnesis por revisar · 12', exact: true })).toBeVisible();
        await links.first().focus();
        const initialScroll = await nav.evaluate((el) => el.scrollTop);
        for (let index = 1; index < await links.count(); index++) {
          await page.keyboard.press('Tab');
          await expect(links.nth(index)).toBeFocused();
          if (await links.nth(index).getByTestId('anamnesis-inbox-count').count()) {
            const badge = await links.nth(index).getByTestId('anamnesis-inbox-count').boundingBox();
            const bounds = await nav.evaluate((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().left + el.clientWidth }));
            expect.soft(badge!.x).toBeGreaterThanOrEqual(bounds.left);
            expect.soft(badge!.x + badge!.width, 'contador íntegro dentro del nav').toBeLessThanOrEqual(bounds.right);
          }
        }
        await expect(links.last()).toBeFocused();
        const geometry = await nav.evaluate((el) => {
          const last = Array.from(el.querySelectorAll('a')).at(-1)!;
          const r = last.getBoundingClientRect();
          const n = el.getBoundingClientRect();
          const style = getComputedStyle(last);
          const badge = el.querySelector('[data-testid=anamnesis-inbox-count]')!.getBoundingClientRect();
          return { scrollbar: (el as HTMLElement).offsetWidth - el.clientWidth,
            badge: { left: badge.left, right: badge.right, top: badge.top, bottom: badge.bottom },
            width: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
            navLeft: n.left, navRight: n.left + el.clientWidth, navTop: n.top, navBottom: n.bottom,
            navScroll: el.scrollTop, documentScroll: document.scrollingElement?.scrollTop ?? 0,
            outline: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset,
            railWidth: el.parentElement!.getBoundingClientRect().width };
        });
        await testInfo.attach(`${scrollbar}-${colorScheme}-${collapsed ? 'rail' : 'expanded'}`, {
          body: JSON.stringify(geometry, null, 2), contentType: 'application/json',
        });
        if (process.env.DX347_QA_DIR) {
          const evidence = process.env.DX347_QA_DIR;
          mkdirSync(evidence, { recursive: true });
          const name = `${scrollbar}-${colorScheme}-${collapsed ? 'rail' : 'expanded'}`;
          writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(geometry, null, 2));
          await page.screenshot({ path: path.join(evidence, `${name}.png`) });
        }
        if (scrollbar === 'classic') expect.soft(geometry.scrollbar).toBe(15);
        // Sea overlay (0 px) o clásica, el enlace ocupa todo el ancho útil del
        // nav menos su padding (px-0.5 en el carril, px-3 expandido).
        expect(geometry.width, 'el enlace ocupa el ancho útil del nav').toBeCloseTo(
          geometry.navRight - geometry.navLeft - (collapsed ? 4 : 24), 0);
        if (collapsed) {
          expect(geometry.railWidth).toBe(64);
          expect(geometry.width, 'ancho útil del enlace con barra clásica').toBeGreaterThanOrEqual(44);
          expect(geometry.bottom - geometry.top, 'alto táctil del enlace del carril').toBeGreaterThanOrEqual(44);
        }
        expect.soft(geometry.navScroll, 'el último enlace desplaza el nav').toBeGreaterThan(0);
        expect(geometry.navScroll).toBeGreaterThan(initialScroll);
        expect(geometry.badge.left).toBeGreaterThanOrEqual(geometry.navLeft);
        expect(geometry.badge.right).toBeLessThanOrEqual(geometry.navRight);
        expect(geometry.badge.top).toBeGreaterThanOrEqual(geometry.navTop);
        expect(geometry.badge.bottom).toBeLessThanOrEqual(geometry.navBottom);
        expect(geometry.documentScroll, 'el documento no se desplaza').toBe(0);
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.navTop);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.navBottom);
        expect(geometry.left).toBeGreaterThanOrEqual(geometry.navLeft);
        expect(geometry.right).toBeLessThanOrEqual(geometry.navRight);
        const focusExtent = Math.max(0, parseFloat(geometry.outlineWidth) + parseFloat(geometry.outlineOffset));
        expect(geometry.top - focusExtent).toBeGreaterThanOrEqual(geometry.navTop);
        expect(geometry.bottom + focusExtent).toBeLessThanOrEqual(geometry.navBottom);
        expect(geometry.left - focusExtent).toBeGreaterThanOrEqual(geometry.navLeft);
        expect(geometry.right + focusExtent).toBeLessThanOrEqual(geometry.navRight);
        expect(geometry.outline).not.toBe('none');
        expect(parseFloat(geometry.outlineWidth)).toBeGreaterThan(0);
        const account = await accountTrigger(page, admin.fullName).boundingBox();
        expect(account!.y + account!.height).toBeLessThanOrEqual(768);
        await expectNoHorizontalScroll(page);
        await page.evaluate(() => {
          for (const animation of document.getAnimations()) {
            if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
          }
        });
        await page.evaluate(axeSource);
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (el: Element) => Promise<AxeResults> } }).axe;
          return (await axe.run(document.querySelector('aside')!)).violations.map(({ id, impact, nodes }) => ({
            id, impact, targets: nodes.map((node) => node.target),

          }));
        });
        if (process.env.DX347_QA_DIR) writeFileSync(path.join(process.env.DX347_QA_DIR, `axe-${scrollbar}-${colorScheme}-${collapsed ? 'rail' : 'expanded'}.json`), JSON.stringify(violations, null, 2));
        expect(violations, 'axe del sidebar').toEqual([]);
        if (collapsed && process.env.DX347_QA_DIR) {
          const alternatives = [];
          for (const option of ['auto', 'stable', 'thin'] as const) {
            await nav.evaluate((el, value) => {
              (el as HTMLElement).style.setProperty('scrollbar-width', value === 'thin' ? 'thin' : 'auto', 'important');
              (el as HTMLElement).style.scrollbarGutter = value === 'stable' ? 'stable' : 'auto';
            }, option);
            // Permitir el layout de la barra antes de medir su espacio real.
            await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
            alternatives.push(await nav.evaluate((el, option) => ({ option,
              scrollbar: (el as HTMLElement).offsetWidth - el.clientWidth,
              linkWidth: el.querySelector('a')!.getBoundingClientRect().width,
            }), option));
          }
          await nav.evaluate((el) => el.removeAttribute('style'));
          writeFileSync(path.join(process.env.DX347_QA_DIR, `${scrollbar}-${colorScheme}-alternatives.json`), JSON.stringify(alternatives, null, 2));
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        const tall = await nav.evaluate((el) => ({ content: el.scrollHeight, viewport: el.clientHeight }));
        expect(tall.content, 'a 900 px no hay scroll innecesario').toBe(tall.viewport);
        await expectNoHorizontalScroll(page);
      }
    });
  }
}

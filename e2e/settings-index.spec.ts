import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { test, expect, type Locator, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * DX-282 (FE-062, FE-068): menú de cuenta alcanzable en cualquier pantalla y
 * página «Ajustes».
 *
 * - El menú de cuenta del ADMIN cabe en 1366×768, 1440×900 y 390×844, también
 *   con la barra lateral plegada: cada ítem queda dentro de la ventana (o se
 *   alcanza con scroll dentro del propio menú, nunca desplazando la página).
 * - Desde «Ajustes» se llega a Horarios y Sedes, y de vuelta con «← Ajustes».
 * - RECEPTION y DENTIST solo ven en /settings lo que pueden abrir.
 * - Ítems de 44 px a 390 px; teclado; axe sin violaciones serias.
 */
const PASSWORD = 'Password123!';

let origin: string;
const admin = { fullName: 'Dueña Ajustes', email: '' };
const reception = { fullName: 'Rosa Ajustes', email: '' };
const dentist = { fullName: 'Odontóloga Ajustes', email: '' };

test.beforeAll(async ({ playwright }) => {
  const suffix = randomUUID().slice(0, 8);
  admin.email = `ajustes.admin.${suffix}@example.com`;
  reception.email = `ajustes.recep.${suffix}@example.com`;
  dentist.email = `ajustes.odonto.${suffix}@example.com`;
  const api = await playwright.request.newContext();
  try {
    const session = await registerClinicViaApi(api, {
      subdomain: `ajustes-${suffix}`,
      clinicName: `Clínica Ajustes ${suffix}`,
      fullName: admin.fullName,
      email: admin.email,
      password: PASSWORD,
    });
    origin = session.origin;
    await addStaffViaApi(api, session, { ...reception, role: 'RECEPTION', password: PASSWORD });
    await addStaffViaApi(api, session, { ...dentist, role: 'DENTIST', password: PASSWORD });
  } finally {
    await api.dispose();
  }
});

/** El disparador visible del menú de cuenta: tarjeta, rail o avatar del topbar. */
function accountTrigger(page: Page, fullName: string): Locator {
  const width = page.viewportSize()?.width ?? 0;
  return width < 768
    ? page.getByRole('button', { name: 'Cuenta', exact: true })
    : page.getByRole('button', { name: new RegExp(fullName) }).first();
}

async function openAccountMenu(page: Page, fullName: string): Promise<Locator> {
  const trigger = accountTrigger(page, fullName);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Cada ítem del menú se puede ver: si no está ya dentro de la ventana, se
 * desplaza DENTRO del menú (`scrollIntoView` sobre el ítem) y entonces sí. La
 * página no se mueve (FE-062: el menú se salía por arriba y no había scroll).
 */
async function expectEveryItemReachable(page: Page, menu: Locator, moment: string) {
  const viewport = page.viewportSize()!;
  const box = await menu.boundingBox();
  expect(box, `${moment}: el menú no tiene caja`).not.toBeNull();
  expect(box!.y, `${moment}: borde superior del menú`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${moment}: borde inferior del menú`).toBeLessThanOrEqual(viewport.height);

  const items = menu.locator('[role="menuitem"], [role="menuitemcheckbox"]');
  const count = await items.count();
  expect(count, `${moment}: ítems del menú`).toBe(4);
  for (let i = 0; i < count; i++) {
    const rect = await items.nth(i).evaluate((el) => {
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        text: el.textContent ?? '',
        pageScroll: document.scrollingElement?.scrollTop ?? 0,
      };
    });
    expect(rect.top, `${moment}: «${rect.text}» por arriba`).toBeGreaterThanOrEqual(0);
    expect(rect.bottom, `${moment}: «${rect.text}» por abajo`).toBeLessThanOrEqual(viewport.height);
    expect(rect.pageScroll, `${moment}: la página no se desplaza`).toBe(0);
  }
}

async function expectTouchTargets(items: Locator, moment: string) {
  const heights = await items.evaluateAll((els) =>
    els.map((el) => ({ text: el.textContent ?? '', height: el.getBoundingClientRect().height })),
  );
  expect(heights.length, `${moment}: hay ítems`).toBeGreaterThan(0);
  for (const { text, height } of heights) {
    expect(height, `${moment}: «${text}» mide ${height}px`).toBeGreaterThanOrEqual(44);
  }
}

test('ADMIN: el menú de cuenta cabe en 1366×768, 1440×900 y 390×844, también con la barra plegada', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, origin, admin.email, PASSWORD);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const moment = `${viewport.width}×${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/patients`);
    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
    const menu = await openAccountMenu(page, admin.fullName);
    await expectEveryItemReachable(page, menu, moment);
    if (viewport.width < 768) {
      await expectTouchTargets(menu.locator('[role="menuitem"], [role="menuitemcheckbox"]'), moment);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }

  // Barra lateral plegada (rail): el menú sale del avatar del pie.
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    const moment = `${viewport.width}×${viewport.height} plegada`;
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/patients`);
    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
    const collapse = page.getByRole('button', { name: 'Colapsar menú' });
    if (await collapse.isVisible()) await collapse.click();
    await expect(page.getByRole('button', { name: 'Expandir menú' })).toBeVisible();
    const menu = await openAccountMenu(page, admin.fullName);
    await expectEveryItemReachable(page, menu, moment);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Expandir menú' }).click();
});

test('ADMIN: Ajustes agrupa las 19 pantallas; de ahí a Horarios y Sedes y de vuelta con «← Ajustes»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, origin, admin.email, PASSWORD);
  await page.goto(`${origin}/patients`);
  await openAccountMenu(page, admin.fullName);
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(`${origin}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'Clínica y sedes',
    'Agenda',
    'Cobro',
    'Historia clínica',
    'Datos y seguridad',
  ]);
  await expect(main.getByRole('listitem').getByRole('link')).toHaveCount(19);

  await main.getByRole('list', { name: 'Agenda' }).getByRole('link', { name: 'Horarios' }).click();
  await expect(page).toHaveURL(`${origin}/settings/horarios`);
  await expect(page.getByRole('heading', { level: 1, name: 'Horarios' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('main').getByRole('link', { name: 'Ajustes', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/settings`);

  await page.getByRole('list', { name: 'Clínica y sedes' }).getByRole('link', { name: 'Sedes' }).click();
  await expect(page).toHaveURL(`${origin}/settings/sedes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sedes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('main').getByRole('link', { name: 'Ajustes', exact: true })).toHaveAttribute(
    'href',
    '/settings',
  );
});

test('ADMIN a 390 px: filas del índice y «← Ajustes» de 44 px, sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, PASSWORD);
  await page.goto(`${origin}/settings`);
  const links = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(links).toHaveCount(19, { timeout: 15_000 });
  await expectTouchTargets(links, '/settings a 390');
  await expectNoHorizontalScroll(page);

  await page.goto(`${origin}/settings/horarios`);
  const back = page.getByRole('main').getByRole('link', { name: 'Ajustes', exact: true });
  await expect(back).toBeVisible({ timeout: 15_000 });
  await expectTouchTargets(back, '«← Ajustes» a 390');
});

for (const person of [
  { role: 'RECEPTION', account: reception },
  { role: 'DENTIST', account: dentist },
]) {
  test(`${person.role}: en Ajustes solo Sedes, Horarios y Privacidad de datos`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, origin, person.account.email, PASSWORD);
    await page.goto(`${origin}/patients`);
    await openAccountMenu(page, person.account.fullName);
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await expect(page).toHaveURL(`${origin}/settings`);

    const links = page.getByRole('main').getByRole('listitem').getByRole('link');
    await expect(links).toHaveText(['Sedes', 'Horarios', 'Privacidad de datos'].map((t) => new RegExp(`^${t}`)), {
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Cobro' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Convenios' })).toHaveCount(0);
  });
}

test('teclado: Enter abre, las flechas recorren, Escape cierra y el foco vuelve al disparador', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, PASSWORD);
  await page.goto(`${origin}/patients`);
  const trigger = accountTrigger(page, admin.fullName);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Mi perfil' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Ajustes' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemcheckbox', { name: 'Tema oscuro' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('axe: /settings y el menú abierto, a 390 y 1440 px, en claro y oscuro', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const evidence = process.env.DX282_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, PASSWORD);

  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function serious(surface: string) {
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<AxeResults> } }).axe;
      return axe.run();
    });
    writeFileSync(path.join(evidence, `axe-${surface}.json`), JSON.stringify(results.violations, null, 2));
    await page.screenshot({ path: path.join(evidence, `${surface}.png`) });
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
  }

  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto(`${origin}/settings`);
      await expect(page.getByRole('main').getByRole('listitem').getByRole('link')).toHaveCount(19, {
        timeout: 15_000,
      });
      expect.soft(await serious(`settings-${width}-${colorScheme}`), `/settings ${width} ${colorScheme}`).toEqual([]);

      await openAccountMenu(page, admin.fullName);
      expect.soft(await serious(`menu-${width}-${colorScheme}`), `menú ${width} ${colorScheme}`).toEqual([]);
      await page.keyboard.press('Escape');
    }
  }
});

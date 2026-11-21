import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { sedeDayFromToday } from './support/clock';
import { axeInBothThemes, axeViolations } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-584: monedas de la clínica y la tasa de hoy en el menú.
 *
 *   1. Una clínica de Venezuela (sede en VES) que acepta USD y VES, con la
 *      tasa manual de hoy (36,5 VES por USD) y «Bs.» como texto del VES:
 *      el menú enseña «1 USD = 36,50 Bs.» junto al selector de sede, a 1440
 *      (barra lateral) y a 390 (barra superior), sin scroll horizontal y sin
 *      violaciones de axe en claro y oscuro; el popover lo detalla y, a
 *      ADMIN, lleva a Ajustes › Tasa de cambio, donde se ven las monedas.
 *      Corregir la tasa en Ajustes pone el menú al día sin recargar.
 *   2. Una clínica que cobra solo en USD (sin monedas configuradas) no ve nada.
 *
 * Estado: crea sus dos clínicas (no toca la demo). La fuente es MANUAL: la
 * suite corre sin proveedor de tasas (EXCHANGE_APP_ID vacío).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const PASSWORD = 'Password123!';
const ve = {
  subdomain: `test-monedas-ve-${suffix}`.slice(0, 40),
  clinicName: `Clínica Caroní ${suffix}`.slice(0, 60),
  fullName: 'Dra. Caroní',
  email: `monedas.ve.${suffix}@example.com`,
  password: PASSWORD,
  location: { currency: 'VES' },
};
const usdOnly = {
  subdomain: `test-monedas-usd-${suffix}`.slice(0, 40),
  clinicName: `Clínica Una Moneda ${suffix}`.slice(0, 60),
  fullName: 'Dr. Moneda',
  email: `monedas.usd.${suffix}@example.com`,
  password: PASSWORD,
};

const INDICATOR = 'Tasa de hoy: 1 USD = 36,50 Bs., fuente manual';

let veAdmin: ApiSession | null = null;
let usdAdmin: ApiSession | null = null;

async function apiPut(request: APIRequestContext, session: ApiSession, path: string, data: object) {
  const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

test.describe('Monedas de la clínica y tasa en el menú (DX-584)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede registrar la clínica (usa scripts/e2e-ci.sh)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    veAdmin = await registerClinicViaApi(request, ve);
    await apiPut(request, veAdmin, '/exchange/settings', {
      source: 'MANUAL',
      acceptedCurrencies: ['USD', 'VES'],
    });
    await apiPut(request, veAdmin, '/exchange/currency-texts', { entries: [{ currency: 'VES', text: 'Bs.' }] });
    await apiPost(request, veAdmin, '/exchange/manual-rates', {
      date: sedeDayFromToday(0),
      currency: 'VES',
      rate: 36.5,
    });
    usdAdmin = await registerClinicViaApi(request, usdOnly);
  });

  test('1440: la tasa junto al selector de sede, su popover y Ajustes; se pone al día al corregirla', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, veAdmin!.origin, ve.email, PASSWORD);
    const aside = page.locator('aside');
    const indicator = aside.getByRole('button', { name: INDICATOR });
    await expect(indicator).toBeVisible({ timeout: 30_000 });
    await expect(indicator).toHaveText('1 USD = 36,50 Bs.');
    await expectNoHorizontalScroll(page);
    const asideAxe = await axeInBothThemes(page, aside);
    expect(asideAxe.light, 'axe del sidebar (claro)').toEqual([]);
    expect(asideAxe.dark, 'axe del sidebar (oscuro)').toEqual([]);
    await shot(page, 'menu', 1440);

    await indicator.click();
    const popover = page.getByTestId('rate-indicator-popover');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('1 USD = 36,50 Bs.');
    await expect(popover).toContainText('Manual · del');
    const popoverAxe = await axeInBothThemes(page, popover);
    expect(popoverAxe.light, 'axe del popover (claro)').toEqual([]);
    expect(popoverAxe.dark, 'axe del popover (oscuro)').toEqual([]);
    await shot(page, 'popover', 1440);
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(indicator).toBeFocused();

    // ADMIN: del popover a Ajustes › Tasa de cambio.
    await indicator.click();
    await popover.getByRole('link', { name: 'Ajustes de la tasa' }).click();
    await expect(page).toHaveURL(/\/settings\/tasa-de-cambio$/);
    const section = page.getByRole('region', { name: 'Monedas de la clínica' });
    await expect(section.getByTestId('clinic-accepted-currencies')).toHaveText('USD, VES');
    await expect(section.getByTestId('clinic-rate-reference')).toHaveText('La de la sede activa');
    await expect(section.getByTestId('clinic-show-rate')).toHaveText('Automático');
    const settingsAxe = await axeInBothThemes(page, page.locator('main'));
    expect(settingsAxe.light, 'axe de Ajustes (claro)').toEqual([]);
    expect(settingsAxe.dark, 'axe de Ajustes (oscuro)').toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await shot(page, 'settings', 1440);

    // Corregir la tasa de hoy: el menú se relee sin recargar la página.
    await page
      .getByRole('button', { name: /Acciones de VES/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Corregir' }).click();
    const dialog = page.getByRole('dialog', { name: /Corregir la tasa de VES/ });
    await dialog.getByLabel('Tasa por 1 USD').fill('40');
    await dialog.getByRole('button', { name: 'Guardar tasa' }).click();
    await expect(dialog).toBeHidden();
    await expect(aside.getByRole('button', { name: 'Tasa de hoy: 1 USD = 40,00 Bs., fuente manual' })).toBeVisible();
  });

  test('390: compacto en la barra superior, sin scroll horizontal; el popover cabe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, veAdmin!.origin, ve.email, PASSWORD);
    const bar = page.locator('header').first();
    const indicator = bar.getByRole('button', { name: 'Tasa de hoy: 1 USD = 40,00 Bs., fuente manual' });
    await expect(indicator).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
    // Los botones de la barra siguen siendo de 44 px y dentro de la pantalla.
    const box = (await indicator.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const barAxe = await axeInBothThemes(page, bar);
    expect(barAxe.light, 'axe de la barra (claro)').toEqual([]);
    expect(barAxe.dark, 'axe de la barra (oscuro)').toEqual([]);
    await shot(page, 'menu', 390);

    await indicator.click();
    const popover = page.getByTestId('rate-indicator-popover');
    await expect(popover).toBeVisible();
    const pop = (await popover.boundingBox())!;
    expect(pop.x).toBeGreaterThanOrEqual(0);
    expect(pop.x + pop.width).toBeLessThanOrEqual(390);
    expect(await axeViolations(page, popover)).toEqual([]);
    await shot(page, 'popover', 390);
  });

  test('una clínica de una sola moneda no ve el indicador (1440 y 390)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const header = page.waitForResponse((r) => r.url().includes('/exchange/header') && r.ok());
    await loginAs(page, usdAdmin!.origin, usdOnly.email, PASSWORD);
    const body = (await (await header).json()) as { visible: boolean; acceptedCurrencies: string[] };
    expect(body).toMatchObject({ visible: false, acceptedCurrencies: [] });
    await expect(page.locator('aside').getByRole('combobox', { name: 'Sede' })).toBeVisible();
    await expect(page.getByTestId('rate-indicator')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('header').first().getByRole('combobox', { name: /^Sede/ })).toBeVisible();
    await expect(page.getByTestId('rate-indicator')).toHaveCount(0);
    await shot(page, 'single-currency', 390);
  });
});

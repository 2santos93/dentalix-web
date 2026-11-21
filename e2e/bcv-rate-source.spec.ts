import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { registerClinicViaApi, type ApiSession } from './support/api';
import { sedeDayFromToday } from './support/clock';
import { axeInBothThemes, axeViolations } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-585: la fuente de la tasa «BCV oficial (Venezuela)».
 *
 * Una clínica de Venezuela (sede en VES, acepta USD y VES, «Bs.») pasa en
 * Ajustes › Tasa de cambio a la fuente BCV y el menú enseña la tasa del BCV
 * con su fecha valor: «1 USD = 919,82 Bs.», «fuente BCV, fecha valor …», en
 * la barra lateral (1440) y en la barra superior (390), con axe en claro y
 * oscuro.
 *
 * La tasa sale del BCV falso (scripts/bcv-stub.mjs), al que scripts/e2e-ci.sh
 * apunta BCV_BASE_URL y BCV_FALLBACK_BASE_URL de la API: la suite nunca
 * consulta el BCV real. La portada falsa publica 919,82270000 Bs. por USD con
 * fecha valor de hoy (Caracas), y la API la guarda al arrancar su worker.
 */
const BCV_STUB_URL = process.env.E2E_BCV_STUB_URL;
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const PASSWORD = 'Password123!';
const ve = {
  subdomain: `test-bcv-${suffix}`.slice(0, 40),
  clinicName: `Clínica Ávila ${suffix}`.slice(0, 60),
  fullName: 'Dra. Ávila',
  email: `bcv.${suffix}@example.com`,
  password: PASSWORD,
  location: { currency: 'VES' },
};

const TODAY = sedeDayFromToday(0);
/** Hoy en el formato de la sede (es-VE): dd/mm/aaaa. */
const TODAY_LABEL = TODAY.split('-').reverse().join('/');
const INDICATOR = `Tasa de hoy: 1 USD = 919,82 Bs., fuente BCV, fecha valor ${TODAY_LABEL}`;

let admin: ApiSession | null = null;

async function apiPut(request: APIRequestContext, session: ApiSession, path: string, data: object) {
  const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

test.describe('Fuente de la tasa BCV oficial (DX-585)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede registrar la clínica (usa scripts/e2e-ci.sh)');
  test.skip(
    !BCV_STUB_URL,
    'E2E_BCV_STUB_URL no definido: la API no apunta al BCV falso (usa scripts/e2e-ci.sh o scripts/bcv-stub.mjs)',
  );
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    admin = await registerClinicViaApi(request, ve);
    await apiPut(request, admin, '/exchange/settings', { acceptedCurrencies: ['USD', 'VES'] });
    await apiPut(request, admin, '/exchange/currency-texts', { entries: [{ currency: 'VES', text: 'Bs.' }] });
    // La tasa del BCV falso la guarda el worker de la API al arrancar: se
    // espera a que rija hoy (con la fuente BCV un momento) y se vuelve a la
    // automática, para que el cambio lo haga la pantalla.
    await apiPut(request, admin, '/exchange/settings', { source: 'BCV' });
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API_URL}/exchange/rates?date=${TODAY}&currencies=VES`, {
            headers: admin!.headers,
          });
          return res.ok() ? ((await res.json()) as { bcv?: { valueDate: string } | null }).bcv?.valueDate : null;
        },
        { message: 'la API no tiene la tasa del BCV falso de hoy', timeout: 60_000 },
      )
      .toBe(TODAY);
    await apiPut(request, admin, '/exchange/settings', { source: 'AUTOMATIC' });
  });

  test('1440: Ajustes ofrece «BCV oficial (Venezuela)» y el menú enseña «BCV» con la fecha valor', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, admin!.origin, ve.email, PASSWORD);
    await page.goto(`${admin!.origin}/settings/tasa-de-cambio`);
    const source = page.getByRole('region', { name: 'De dónde sale la tasa' });
    await expect(source.getByTestId('exchange-rate-source')).toHaveText('Automática', { timeout: 30_000 });

    await source.getByRole('button', { name: 'Cambiar', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar de dónde sale la tasa' });
    await expect(dialog.getByRole('radio')).toHaveCount(3);
    const bcv = dialog.getByRole('radio', { name: /BCV oficial \(Venezuela\)/ });
    await bcv.check();
    await expect(dialog).toContainText('Banco Central de Venezuela');
    const dialogAxe = await axeInBothThemes(page, dialog);
    expect(dialogAxe.light, 'axe del diálogo (claro)').toEqual([]);
    expect(dialogAxe.dark, 'axe del diálogo (oscuro)').toEqual([]);
    await shot(page, 'source-dialog', 1440);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(source.getByTestId('exchange-rate-source')).toHaveText('BCV oficial (Venezuela)');

    // «Tasa de hoy»: la del BCV con su fecha valor.
    const today = page.getByRole('region', { name: 'Tasa de hoy' });
    await expect(today).toContainText(`VES y EUR, la oficial del BCV (fecha valor ${TODAY_LABEL})`);
    await expect(today.getByTestId('exchange-rate-today')).toContainText('919,8227');
    await expectNoHorizontalScroll(page);
    const settingsAxe = await axeInBothThemes(page, page.locator('main'));
    expect(settingsAxe.light, 'axe de Ajustes (claro)').toEqual([]);
    expect(settingsAxe.dark, 'axe de Ajustes (oscuro)').toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'settings', 1440);

    // El menú se relee al guardar la fuente, sin recargar.
    const aside = page.locator('aside');
    const indicator = aside.getByRole('button', { name: INDICATOR });
    await expect(indicator).toBeVisible({ timeout: 30_000 });
    await expect(indicator).toHaveText('1 USD = 919,82 Bs.');
    await indicator.click();
    const popover = page.getByTestId('rate-indicator-popover');
    await expect(popover).toContainText(`BCV · fecha valor ${TODAY_LABEL}`);
    const popoverAxe = await axeInBothThemes(page, popover);
    expect(popoverAxe.light, 'axe del popover (claro)').toEqual([]);
    expect(popoverAxe.dark, 'axe del popover (oscuro)').toEqual([]);
    await shot(page, 'popover', 1440);
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('390: la pastilla de la barra superior dice «BCV» en su nombre y el popover cabe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, admin!.origin, ve.email, PASSWORD);
    const bar = page.locator('header').first();
    const indicator = bar.getByRole('button', { name: INDICATOR });
    await expect(indicator).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
    const barAxe = await axeInBothThemes(page, bar);
    expect(barAxe.light, 'axe de la barra (claro)').toEqual([]);
    expect(barAxe.dark, 'axe de la barra (oscuro)').toEqual([]);
    await shot(page, 'menu', 390);

    await indicator.click();
    const popover = page.getByTestId('rate-indicator-popover');
    await expect(popover).toContainText(`BCV · fecha valor ${TODAY_LABEL}`);
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await axeViolations(page, popover)).toEqual([]);
    await shot(page, 'popover', 390);
  });
});

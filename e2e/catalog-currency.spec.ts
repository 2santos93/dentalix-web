import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e (DX-502-bis): la moneda del catálogo explícita por clínica.
 *
 * Una clínica nueva por corrida con dos sedes en monedas distintas: la de la
 * suite (USD, `E2E_REGION`) y otra en VES (Caracas). Sin una moneda común, el
 * catálogo no tiene moneda conocida (DX-502). Un paciente con un convenio del
 * 20 % y un procedimiento de 150 en el catálogo.
 *  1. Sin fijar: Ajustes › Monedas lo dice («monedas distintas») y el
 *     presupuesto de un plan en USD oculta el precio de lista, con su nota, y
 *     no enseña «Ahorro por convenio».
 *  2. El ADMIN la fija en USD en el diálogo (a 390 px cabe): el presupuesto de
 *     un ítem NUEVO en USD enseña «Precio de lista» y «Ahorro por convenio»;
 *     el del ítem anterior sigue igual (lo congelado no cambia).
 *  3. Recepción no ve el ajuste (estado bloqueado de la página).
 *  4. DX-502-ter: con la moneda fijada en USD y sedes en USD y VES, Ajustes ›
 *     Catálogo y el selector de procedimiento del ítem muestran el precio en USD
 *     (la API manda la moneda; ya no se deduce de las sedes).
 * A 390 y 1440 px, sin scroll horizontal a 390. Capturas en E2E_QA_DIR.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `catmoneda-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Catálogo', email: `admin.catmoneda.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `recep.catmoneda.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;
const CARACAS = { country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' } as const;

const CATALOG_PRICE = 150;
const PERCENT = 20;
const AGREEMENT_PRICE = CATALOG_PRICE * (1 - PERCENT / 100);
const SAVING = CATALOG_PRICE - AGREEMENT_PRICE;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

/** Solo la cifra con el formato de la sede de la suite («150,00»). */
const sedeFormat = regionalFormat(E2E_REGION);
const figure = (amount: number): string => sedeFormat.number(amount, { min: 2, max: 2 });

let session: ApiSession;
let patientId = '';
let catalogItemId = '';
let planBefore = '';

async function planWithItem(request: APIRequestContext): Promise<string> {
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
    currency: 'USD',
  });
  await apiPost(request, session, `/treatment-plans/${plan.id}/items`, { toothNumber: '21', catalogItemId });
  return plan.id;
}

async function shoot(page: Page, name: string, width: number, focus?: Locator): Promise<void> {
  if (!QA_DIR) return;
  if (focus) {
    await expect(focus.first()).toBeVisible({ timeout: 15_000 });
    await focus.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function openQuote(page: Page, planId: string): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/patients/${patientId}/treatment-plans/${planId}`);
  await expect(page.getByTestId('quote-header')).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  expect(E2E_REGION.currency).toBe('USD');
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Catálogo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await createLocationViaApi(request, session, { name: 'Sede Caracas', ...CARACAS });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  catalogItemId = (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `dx502b-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: `Corona DX502B ${suffix}`.slice(0, 40),
      color: '#3366CC',
      defaultPrice: CATALOG_PRICE,
    })
  ).id;
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Lucía',
      lastName: `Catalogo${suffix}`.slice(0, 40),
      docType: 'PASSPORT',
      docNumber: `CAT${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
  const payer = await apiPost<{ id: string }>(request, session, '/payers', {
    name: 'Cortesía de la clínica',
    type: 'OTHER',
  });
  const agreement = await apiPost<{ id: string }>(request, session, '/agreements', {
    name: `Cortesía −${PERCENT} %`,
    payerId: payer.id,
    kind: 'PERCENT_DISCOUNT',
    percent: PERCENT,
  });
  // Un convenio de cortesía (pagador OTHER) lo asigna el ADMIN sin cobertura.
  const assigned = await request.put(`${API_URL}/patients/${patientId}/agreement`, {
    headers: session.headers,
    data: { agreementId: agreement.id },
  });
  expect(assigned.ok(), `PUT /patients/:id/agreement falló: ${await assigned.text()}`).toBeTruthy();
  planBefore = await planWithItem(request);
});

test('sin fijar: Ajustes lo dice y el presupuesto oculta el precio de lista, sin ahorro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/monedas`);
  const section = page.getByRole('region', { name: 'Moneda del catálogo' });
  await expect(section.getByTestId('catalog-currency')).toHaveText('Sin fijar', { timeout: 15_000 });
  await expect(section.getByText(/tus sedes activas usan monedas distintas/)).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'catalogo-sin-fijar', viewport.width, section);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openQuote(page, planBefore);
  await expect(page.getByTestId('quote-list-price-hidden-note')).toBeVisible();
  await expect(page.getByText('Ahorro por convenio')).toHaveCount(0);
  await expect(page.getByTestId('quote-total-USD')).toContainText(figure(AGREEMENT_PRICE));
});

test('el ADMIN la fija en USD: el ítem nuevo enseña precio de lista y ahorro; el anterior no cambia', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/monedas`);
  const section = page.getByRole('region', { name: 'Moneda del catálogo' });
  await expect(section.getByTestId('catalog-currency')).toHaveText('Sin fijar', { timeout: 15_000 });
  await section.getByRole('button', { name: 'Cambiar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar la moneda del catálogo' });
  await expect(dialog.getByText(/Solo afecta a los ítems que se agreguen a los planes desde ahora/)).toBeVisible();
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await shoot(page, 'catalogo-dialogo', 390, dialog);
  await dialog.getByLabel('Moneda', { exact: true }).selectOption('USD');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(section.getByTestId('catalog-currency')).toHaveText(/^USD · /);
  await expect(page.getByText('Moneda del catálogo guardada.')).toBeVisible();
  await page.reload();
  await expect(section.getByTestId('catalog-currency')).toHaveText(/^USD · /, { timeout: 15_000 });
  await expect(section.getByText('Los ya creados conservan la suya.', { exact: false })).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'catalogo-usd', viewport.width, section);
  }

  const planAfter = await planWithItem(request);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openQuote(page, planAfter);
    const saving = page.getByTestId('quote-saving-USD');
    await expect(saving).toContainText('Ahorro por convenio');
    await expect(saving).toContainText(figure(SAVING));
    await expect(page.getByText(/Precio de lista/).locator('visible=true').first()).toContainText(
      figure(CATALOG_PRICE),
    );
    await expect(page.getByTestId('quote-list-price-hidden-note')).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'presupuesto-catalogo-usd', viewport.width, saving);
  }

  // Lo congelado no cambia: el presupuesto anterior sigue sin precio de lista.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openQuote(page, planBefore);
  await expect(page.getByTestId('quote-list-price-hidden-note')).toBeVisible();
  await expect(page.getByText('Ahorro por convenio')).toHaveCount(0);
});

const CATALOG_LABEL_PREFIX = 'Corona DX502B';

test('DX-502-ter: con la moneda fijada en USD, el catálogo y el selector de procedimiento muestran USD', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  // Autónomo: fija USD por API (idempotente), sin depender del test serial anterior.
  const fixed = await request.patch(`${API_URL}/clinic/settings`, {
    headers: session.headers,
    data: { catalogCurrency: 'USD' },
  });
  expect(fixed.ok(), `PATCH /clinic/settings falló: ${await fixed.text()}`).toBeTruthy();
  const usd = /US\$|USD/;
  await loginAs(page, origin, admin.email, password);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);

    // Ajustes › Catálogo: sedes en USD y VES, y aun así el precio sale en USD.
    await page.goto(`${origin}/catalog`);
    // La lista es paginada y la clínica nace con el catálogo semilla: se busca el ítem.
    await page.getByLabel('Buscar por nombre, código o categoría').fill(CATALOG_LABEL_PREFIX);
    // 1440 px: tabla; 390 px: lista de tarjetas. Siempre la fila de ESTE ítem.
    const row =
      viewport.width >= 768
        ? page
            .getByRole('table', { name: /catálogo/i })
            .getByRole('row', { name: new RegExp(CATALOG_LABEL_PREFIX) })
        : page
            .getByRole('list', { name: /catálogo/i })
            .getByRole('listitem')
            .filter({ hasText: CATALOG_LABEL_PREFIX });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(figure(CATALOG_PRICE));
    await expect(row).toContainText(usd);
    await expect(row).not.toContainText(/VES|Bs/);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'catalogo-precios-usd', viewport.width, row);

    // Selector de procedimiento del ítem: cada fila con precio lleva su moneda.
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');
    const form = panel.getByRole('form', { name: 'Agregar ítem' });
    await expect(form).toBeVisible({ timeout: 15_000 });
    const group = form.getByRole('group', { name: 'Procedimiento' });
    await group.getByRole('searchbox', { name: 'Buscar en el catálogo' }).fill(CATALOG_LABEL_PREFIX);
    const option = group.getByRole('radio', { name: new RegExp(CATALOG_LABEL_PREFIX) });
    await expect(option).toBeVisible();
    const optionPrice = group.locator('label').filter({ has: option }).getByTestId('catalog-picker-price');
    await expect(optionPrice).toContainText(figure(CATALOG_PRICE));
    await expect(optionPrice).toContainText(usd);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'selector-precio-usd', viewport.width, group);
  }
});

test('recepción no ve el ajuste: estado bloqueado de la página', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings/monedas`);
  await expect(page.getByText('Solo administración cambia cómo se escribe cada moneda.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: 'Moneda del catálogo' })).toHaveCount(0);
});

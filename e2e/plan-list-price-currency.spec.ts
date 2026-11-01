import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { formatCurrency } from '../src/lib/format/currency';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-489): plan en EUR con el catálogo en COP.
 *
 * Una clínica nueva con su única sede en COP (`E2E_REGION`): el catálogo (que
 * no lleva moneda) está en COP, la de sus sedes. La sede tiene una lista de
 * precios activa en EUR, así que un ítem de un plan en EUR toma el precio de
 * esa lista (100,55 EUR) y guarda el de catálogo (80.000) como precio de lista.
 *
 *   - Pestaña del plan: el ítem dice «precio de lista COP 80.000,00», nunca
 *     «EUR 80.000,00»; el total, «Pagado» y la lista de abonos pintan el
 *     mismo importe con UN formato (el de la sede, código ISO).
 *   - Presupuesto imprimible (pantalla, `media: print` y PDF): «Precio de
 *     lista 80.000,00 COP», la nota de que es el del catálogo y no se
 *     convierte, y sin «Ahorro por convenio».
 * En escritorio (1440 px) y en móvil (390 px, sin scroll horizontal).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `lista-eur-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.dx489.${suffix}@example.com` };
const procedureLabel = `Corona DX489 ${suffix}`.slice(0, 40);
const CATALOG_PRICE = 80_000;
const LIST_PRICE_EUR = 100.55;

const sedeFmt = regionalFormat(E2E_REGION);
/** Importes de la pestaña del plan: formato de la sede y código ISO (DX-386, DX-489). */
const sede = (amount: number, currency: string) => moneyWithCode(amount, currency, sedeFmt).replace(/ /g, ' ');
/** Importes del documento impreso: `formatCurrency` (pendiente de DX-354). */
const printed = (amount: number, currency: string) => formatCurrency(amount, currency).replace(/ /g, ' ');

let session: ApiSession;
let patientId = '';
let planId = '';

async function apiPut(request: APIRequestContext, headers: Record<string, string>, path: string, data: object) {
  const res = await request.put(`${API_URL}${path}`, { headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Lista EUR ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  expect(E2E_REGION.currency).toBe('COP');
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  expect(locations.ok()).toBeTruthy();
  const [location] = (await locations.json()) as { id: string; currency: string }[];
  expect(location.currency).toBe('COP');
  const inSede = { ...session, headers: { ...session.headers, 'X-Location-Id': location.id } };

  const catalogItem = await apiPost<{ id: string }>(request, inSede, '/catalog/items', {
    code: `dx489-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: procedureLabel,
    color: '#3366CC',
    defaultPrice: CATALOG_PRICE,
  });
  const list = await apiPost<{ id: string }>(request, inSede, '/price-lists', {
    name: `Tarifa EUR ${suffix}`.slice(0, 120),
    currency: 'EUR',
    locationId: location.id,
  });
  await apiPut(request, inSede.headers, `/price-lists/${list.id}/items`, {
    items: [{ catalogItemId: catalogItem.id, price: LIST_PRICE_EUR }],
  });
  ({ id: patientId } = await apiPost<{ id: string }>(request, inSede, '/patients', {
    firstName: 'Elena',
    lastName: `Lista${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `LE${suffix}`.slice(0, 20),
    sex: 'F',
  }));
  ({ id: planId } = await apiPost<{ id: string }>(request, inSede, `/patients/${patientId}/treatment-plans`, {
    currency: 'EUR',
  }));
  const item = await apiPost<{ price: number; basePrice: number | null; priceSource: string }>(
    request,
    inSede,
    `/treatment-plans/${planId}/items`,
    { toothNumber: '21', catalogItemId: catalogItem.id },
  );
  // Lo guardado no cambia (DX-489): el precio de la lista en EUR y el de catálogo.
  expect(item).toMatchObject({ price: LIST_PRICE_EUR, basePrice: CATALOG_PRICE, priceSource: 'PRICE_LIST' });
  await apiPost(request, inSede, `/treatment-plans/${planId}/payments`, {
    amount: LIST_PRICE_EUR,
    currency: 'EUR',
    paidAt: new Date().toISOString(),
    method: 'CASH',
  });
});

async function openPlan(page: Page): Promise<Locator> {
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
  return panel;
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`plan en EUR con catálogo en COP: precio de lista en COP en la pestaña y en el presupuesto (${viewport.name})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await loginAs(page, origin, admin.email, password);
    const panel = await openPlan(page);

    // --- Pestaña del plan.
    const origin489 = panel.getByText(/Lista de precios de la sede · precio de lista/).filter({ visible: true }).first();
    await expect(origin489).toBeVisible({ timeout: 10_000 });
    await expect(origin489).toHaveText(`Lista de precios de la sede · precio de lista ${sede(CATALOG_PRICE, 'COP')}`);
    await expect(panel).not.toContainText(sede(CATALOG_PRICE, 'EUR'));
    await expect(panel).not.toContainText(printed(CATALOG_PRICE, 'EUR'));

    // Un solo formato para el mismo importe: resumen, «Pagado» y abonos.
    const figure = (term: string) =>
      panel.locator('dl > div').filter({ has: page.getByRole('term').getByText(term, { exact: true }) }).getByRole('definition');
    await expect(figure('Total')).toHaveText(sede(LIST_PRICE_EUR, 'EUR'));
    await expect(figure('Pagado')).toHaveText(sede(LIST_PRICE_EUR, 'EUR'));
    const payments = panel.getByRole('button', { name: /abonos registrados/i });
    if ((await payments.getAttribute('aria-expanded')) === 'false') await payments.click();
    await expect(panel.getByRole('table', { name: /abonos del plan de tratamiento/i })).toContainText(
      sede(LIST_PRICE_EUR, 'EUR'),
    );
    await expect(panel).not.toContainText(printed(LIST_PRICE_EUR, 'EUR'));
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // --- Presupuesto imprimible: lo mismo que la pantalla.
    const [printPage] = await Promise.all([
      context.waitForEvent('page'),
      panel.getByRole('link', { name: /Imprimir presupuesto/ }).click(),
    ]);
    await printPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(printPage.getByTestId('quote-header')).toBeVisible({ timeout: 15_000 });
    const listLine = `Precio de lista ${printed(CATALOG_PRICE, 'COP')}`;
    const note = 'El precio de lista es el del catálogo de la clínica, en COP: es de referencia y no se convierte a EUR.';
    // En pantalla estrecha, la ficha; en ancha, la tabla.
    const items = printPage.getByRole(viewport.width === 390 ? 'list' : 'table', {
      name: 'Procedimientos del presupuesto',
    });
    await expect(items).toContainText(listLine);
    await expect(items).not.toContainText(printed(CATALOG_PRICE, 'EUR'));
    await expect(printPage.getByTestId('quote-list-price-note')).toHaveText(note);
    await expect(printPage.getByText('Ahorro por convenio')).toHaveCount(0);
    await expect(printPage.getByTestId('quote-total-EUR')).toContainText(printed(LIST_PRICE_EUR, 'EUR'));
    if (viewport.width === 390) await expectNoHorizontalScroll(printPage);

    // En papel (y en el PDF) siempre es tabla, con el mismo precio de lista.
    await printPage.emulateMedia({ media: 'print' });
    const paper = printPage.getByRole('table', { name: 'Procedimientos del presupuesto' });
    await expect(paper).toBeVisible();
    await expect(paper).toContainText(listLine);
    await expect(printPage.getByTestId('quote-list-price-note')).toHaveText(note);
    if (viewport.width === 1440) {
      const pdf = await printPage.pdf({ format: 'A4', preferCSSPageSize: true });
      expect(pdf.byteLength).toBeGreaterThan(0);
    }
    await printPage.close();
  });
}

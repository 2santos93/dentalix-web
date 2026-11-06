import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-513): una rebaja frente a un catálogo en OTRA moneda no es un
 * descuento.
 *
 * Una clínica nueva con su única sede en USD (`E2E_REGION`): el catálogo está
 * en USD (3.600,00). La ADMIN (tope 100 %, motivo por encima del 10 %):
 *   - Plan en VES: al bajar el precio a 80 el formulario del ítem NO pide el
 *     motivo ni avisa «cuenta como descuento»; dice la referencia en USD y que
 *     no cuenta. El ítem se guarda sin firma de descuento.
 *   - Plan en USD (misma moneda): igual que antes (SEC-041): aviso y motivo.
 *   - Informe de descuentos: sale la rebaja en USD y la de convenio (SEC-047,
 *     su frase larga sin desbordar a 390 px), nunca el ítem en VES.
 * En escritorio (1440 px) y en móvil (390 px, sin scroll horizontal).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `dto-moneda-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.dx513.${suffix}@example.com` };
const procedureLabel = `Corona DX513 ${suffix}`.slice(0, 40);
const CATALOG_PRICE = 3600;
const PRICE_NOTICE = 'Precio por debajo del de catálogo: cuenta como descuento.';

const sedeFmt = regionalFormat(E2E_REGION);
const sede = (amount: number, currency: string) => moneyWithCode(amount, currency, sedeFmt).replace(/ /g, ' ');

let session: ApiSession;
let procedureId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Moneda ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  expect(E2E_REGION.currency).toBe('USD');
  ({ id: procedureId } = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `dx513-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: procedureLabel,
    color: '#3366CC',
    defaultPrice: CATALOG_PRICE,
  }));
});

/** Paciente con un plan vacío en `currency`. */
async function patientWithPlan(page: Page, tag: string, currency: string): Promise<{ patientId: string; planId: string }> {
  const { id: patientId } = await apiPost<{ id: string }>(page.request, session, '/patients', {
    firstName: 'Elena',
    lastName: `Moneda${tag}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `DX513${tag}`.slice(0, 20),
    sex: 'F',
  });
  const { id: planId } = await apiPost<{ id: string }>(page.request, session, `/patients/${patientId}/treatment-plans`, {
    currency,
  });
  return { patientId, planId };
}

async function openForm(page: Page, patientId: string): Promise<{ panel: Locator; price: Locator }> {
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
  await panel.getByLabel('Código FDI').fill('16');
  await panel.getByLabel('Buscar en el catálogo').fill(procedureLabel);
  await panel.getByRole('radio', { name: procedureLabel }).check();
  const price = panel.getByLabel('Precio', { exact: true });
  await expect(price).toHaveValue(String(CATALOG_PRICE), { timeout: 10_000 });
  return { panel, price };
}

async function planItems(page: Page, planId: string) {
  const res = await page.request.get(`${API_URL}/treatment-plans/${planId}`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { items: { price: number; discountById: string | null; catalogCurrency: string | null }[] })
    .items;
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`plan en VES con el catálogo en USD: ni motivo ni informe; en USD, como siempre (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    await loginAs(page, origin, admin.email, password);

    // --- Plan en VES: 80 VES frente a 3.600 USD no es un descuento.
    const ves = await patientWithPlan(page, `v${tag}`, 'VES');
    const vesForm = await openForm(page, ves.patientId);
    await vesForm.price.fill('80');
    const note = vesForm.panel.locator('#tp-price-below-catalog');
    await expect(note).toHaveText(
      `Precio de catálogo: ${sede(CATALOG_PRICE, 'USD')}, en otra moneda y sin convertir. No cuenta como descuento: ni pide motivo ni sale en el informe de descuentos.`,
    );
    await expect(vesForm.panel.getByText(PRICE_NOTICE, { exact: true })).toHaveCount(0);
    await expect(vesForm.panel.getByLabel(/^Motivo del descuento/)).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await vesForm.panel.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    await expect.poll(async () => (await planItems(page, ves.planId)).length, { timeout: 10_000 }).toBe(1);
    expect((await planItems(page, ves.planId))[0]).toMatchObject({ price: 80, discountById: null, catalogCurrency: 'USD' });

    // --- Plan en USD (misma moneda): aviso y motivo, como SEC-041.
    const usd = await patientWithPlan(page, `u${tag}`, 'USD');
    const usdForm = await openForm(page, usd.patientId);
    await usdForm.price.fill('80');
    await expect(usdForm.panel.getByText(PRICE_NOTICE, { exact: true })).toBeVisible();
    await expect(usdForm.panel.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeVisible();
    await usdForm.panel.getByLabel('Motivo del descuento', { exact: true }).selectOption('PROMOTION');
    await usdForm.panel.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    await expect.poll(async () => (await planItems(page, usd.planId)).length, { timeout: 10_000 }).toBe(1);

    // --- SEC-047: convenio interno al 100 % en USD (misma moneda): su línea.
    const payer = await apiPost<{ id: string }>(page.request, session, '/payers', {
      name: `Cortesía ${tag}`.slice(0, 60),
      type: 'OTHER',
    });
    const agreement = await apiPost<{ id: string }>(page.request, session, '/agreements', {
      name: `Cortesía empleados de la clínica 100 % ${tag}`.slice(0, 120),
      payerId: payer.id,
      kind: 'PERCENT_DISCOUNT',
      percent: 100,
    });
    const covered = await patientWithPlan(page, `c${tag}`, 'USD');
    const assigned = await page.request.put(`${API_URL}/patients/${covered.patientId}/agreement`, {
      headers: session.headers,
      data: { agreementId: agreement.id },
    });
    expect(assigned.ok(), await assigned.text()).toBeTruthy();
    await apiPost(page.request, session, `/treatment-plans/${covered.planId}/items`, {
      toothNumber: '11',
      catalogItemId: procedureId,
    });

    // --- Informe: la rebaja en USD y la de convenio; el ítem en VES, no.
    await page.goto(`${origin}/caja/descuentos`);
    await expect(page.getByRole('heading', { name: 'Descuentos', level: 1 })).toBeVisible({ timeout: 15_000 });
    const rows =
      viewport.width === 390
        ? page.getByRole('list', { name: 'Descuentos del periodo' }).getByRole('listitem')
        : page.getByRole('table', { name: 'Descuentos del periodo' }).getByRole('row');
    await expect(rows.filter({ hasText: `Monedau${tag}`.slice(0, 40) })).toHaveCount(1);
    await expect(
      rows.filter({ hasText: `Monedau${tag}`.slice(0, 40) }).filter({ hasText: `Precio rebajado a ${sede(80, 'USD')}` }),
    ).toHaveCount(1);
    await expect(rows.filter({ hasText: `Monedav${tag}`.slice(0, 40) })).toHaveCount(0);
    await expect(page.getByTestId('discount-total-VES')).toHaveCount(0);
    const agreementLine = rows.filter({ hasText: `Monedac${tag}`.slice(0, 40) });
    await expect(agreementLine).toHaveCount(1);
    await expect(agreementLine).toContainText('Convenio «Cortesía empleados de la clínica 100 %');
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
  });
}

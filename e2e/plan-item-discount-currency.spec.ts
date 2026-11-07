import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { DAY_MS } from './support/clock';
import { fillDateRange } from './support/dates';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-513-bis): una rebaja frente a un catálogo en OTRA moneda se mide
 * frente a la referencia CONVERTIDA con la tasa del día, congelada en el ítem.
 *
 * Una clínica nueva con su única sede en USD (`E2E_REGION`): el catálogo está
 * en USD (100,00) y la clínica usa tasa MANUAL (400 Bs./USD, sembrada: la CI
 * no tiene proveedor). La ADMIN (tope 100 %, motivo por encima del 10 %):
 *   - Plan en VES: el precio se precarga convertido (40.000,00 Bs.) con la
 *     nota del catálogo en USD y la tasa; al bajarlo a 35.000 (12,5 %) avisa
 *     «cuenta como descuento» y pide el motivo; el ítem guarda la foto.
 *   - Plan en USD (misma moneda): igual que antes (SEC-041): aviso y motivo.
 *   - Informe de descuentos: la fila en VES con la rebaja, el catálogo en USD
 *     y la tasa; la rebaja en USD y la de convenio (SEC-047, sin desbordar a
 *     390 px). El periodo se fija alrededor de los ítems (H3 de DX-513).
 * En escritorio (1440 px) y en móvil (390 px, sin scroll horizontal).
 *
 * DX-513-ter: convenio de LISTA con el catálogo en otra moneda. El catálogo
 * de esta clínica está en USD (100,00), así que es el caso espejo del de
 * Venezuela (catálogo en VES, lista en USD), con la misma regla:
 *   - Lista en VES (30.000 Bs.) y plan en VES, con la tasa del día: el alta
 *     congela la base convertida (40.000 Bs.) y el informe mide la rebaja de
 *     convenio (10.000 Bs.) con el catálogo en USD y la tasa.
 *   - Lista en EUR y plan en EUR, sin tasa de EUR: el alta funciona igual y
 *     el informe la señala «sin referencia comparable» y «Sin medir», con su
 *     recuento en el resumen.
 */
// Revisión H2: 8 caracteres, como `discounts.spec.ts`, para que el ancho del
// viewport quepa en el `docNumber` (máx. 20) y los dos tests no lo compartan.
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const subdomain = `dto-moneda-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.dx513b.${suffix}@example.com` };
const procedureLabel = `Corona DX513 ${suffix}`.slice(0, 40);
const CATALOG_PRICE = 100;
/** Tasa MANUAL de la clínica: Bs. por 1 USD. */
const VES_RATE = 400;
const CONVERTED = CATALOG_PRICE * VES_RATE;
const PRICE_NOTICE = 'Precio por debajo del de catálogo: cuenta como descuento.';

const sedeFmt = regionalFormat(E2E_REGION);
const sede = (amount: number, currency: string) => moneyWithCode(amount, currency, sedeFmt).replace(/ /g, ' ');

/** Día civil `YYYY-MM-DD` de `at` en la zona de la sede de la suite. */
const sedeDay = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: E2E_REGION.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

let session: ApiSession;
let procedureId = '';
let rateDay = '';

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
  // DX-513-bis: la tasa del día de la sede, registrada por la ADMIN.
  rateDay = sedeDay(new Date());
  const settings = await request.put(`${API_URL}/exchange/settings`, {
    headers: session.headers,
    data: { source: 'MANUAL' },
  });
  expect(settings.ok(), await settings.text()).toBeTruthy();
  // DX-513-ter (L1): también la de mañana en la zona de la sede, como la e2e de
  // la API: una ejecución que cruce la medianoche sigue teniendo tasa del día.
  for (const date of [rateDay, sedeDay(new Date(Date.now() + DAY_MS))]) {
    await apiPost(request, session, '/exchange/manual-rates', { date, currency: 'VES', rate: VES_RATE });
  }
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

async function openForm(
  page: Page,
  patientId: string,
  prefilled: number = CATALOG_PRICE,
): Promise<{ panel: Locator; price: Locator }> {
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
  await panel.getByLabel('Código FDI').fill('16');
  await panel.getByLabel('Buscar en el catálogo').fill(procedureLabel);
  await panel.getByRole('radio', { name: procedureLabel }).check();
  const price = panel.getByLabel('Precio', { exact: true });
  await expect(price).toHaveValue(String(prefilled), { timeout: 10_000 });
  return { panel, price };
}

async function planItems(page: Page, planId: string) {
  const res = await page.request.get(`${API_URL}/treatment-plans/${planId}`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  return (
    (await res.json()) as {
      items: {
        price: number;
        discountById: string | null;
        catalogCurrency: string | null;
        referencePriceInPlan: number | null;
        referenceRate: { fromPerBase: number; toPerBase: number; source: string; rateDate: string } | null;
      }[];
    }
  ).items;
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`plan en VES con el catálogo en USD: referencia convertida, motivo e informe con la tasa; en USD, como siempre (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    await loginAs(page, origin, admin.email, password);
    // Revisión H3: el periodo del informe se fija alrededor de los ítems (un
    // día antes del primero y uno después del último), nunca «el mes hasta
    // hoy»: un test que cruce la medianoche de fin de mes no los pierde.
    const seededFrom = new Date();
    const rateText = `tasa 1 USD = ${sedeFmt.number(VES_RATE, { min: 0, max: 4 })} VES del ${sedeFmt.civilDate(rateDay)}, manual`;

    // --- Plan en VES: 100 USD a 400 = 40.000 Bs., precargado y con la nota.
    const ves = await patientWithPlan(page, `v${tag}`, 'VES');
    const vesForm = await openForm(page, ves.patientId, CONVERTED);
    const converted = vesForm.panel.locator('#tp-price-converted');
    await expect(converted).toHaveText(
      `Catálogo: ${sede(CATALOG_PRICE, 'USD')} ≈ ${sede(CONVERTED, 'VES')} (${rateText}).`,
    );
    // Bajarlo a 35.000 (12,5 %) cuenta como descuento y pide el motivo.
    await vesForm.price.fill('35000');
    await expect(vesForm.panel.getByText(PRICE_NOTICE, { exact: true })).toBeVisible();
    await expect(vesForm.panel.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeVisible();
    await vesForm.panel.getByLabel('Motivo del descuento', { exact: true }).selectOption('PROMOTION');
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await vesForm.panel.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    await expect.poll(async () => (await planItems(page, ves.planId)).length, { timeout: 10_000 }).toBe(1);
    expect((await planItems(page, ves.planId))[0]).toMatchObject({
      price: 35000,
      catalogCurrency: 'USD',
      referencePriceInPlan: CONVERTED,
      referenceRate: { fromPerBase: 1, toPerBase: VES_RATE, source: 'MANUAL', rateDate: rateDay },
    });
    expect((await planItems(page, ves.planId))[0].discountById).not.toBeNull();

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

    const seededTo = new Date();

    // --- Informe: la rebaja en VES con el catálogo en USD y la tasa; la de
    // USD y la de convenio, como siempre.
    await page.goto(`${origin}/caja/descuentos`);
    await expect(page.getByRole('heading', { name: 'Descuentos', level: 1 })).toBeVisible({ timeout: 15_000 });
    await fillDateRange(
      page,
      'Periodo',
      sedeDay(new Date(seededFrom.getTime() - DAY_MS)),
      sedeDay(new Date(seededTo.getTime() + DAY_MS)),
    );
    const rows =
      viewport.width === 390
        ? page.getByRole('list', { name: 'Descuentos del periodo' }).getByRole('listitem')
        : page.getByRole('table', { name: 'Descuentos del periodo' }).getByRole('row');
    await expect(rows.filter({ hasText: `Monedau${tag}`.slice(0, 40) })).toHaveCount(1);
    await expect(
      rows.filter({ hasText: `Monedau${tag}`.slice(0, 40) }).filter({ hasText: `Precio rebajado a ${sede(80, 'USD')}` }),
    ).toHaveCount(1);
    const vesRow = rows.filter({ hasText: `Monedav${tag}`.slice(0, 40) });
    await expect(vesRow).toHaveCount(1);
    await expect(vesRow).toContainText(`Precio rebajado a ${sede(35000, 'VES')}`);
    await expect(vesRow).toContainText(`Catálogo ${sede(CATALOG_PRICE, 'USD')} · ${rateText}`);
    await expect(page.getByTestId('discount-total-VES')).toHaveCount(1);
    const agreementLine = rows.filter({ hasText: `Monedac${tag}`.slice(0, 40) });
    await expect(agreementLine).toHaveCount(1);
    await expect(agreementLine).toContainText('Convenio «Cortesía empleados de la clínica 100 %');
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
  });
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`DX-513-ter: lista de convenio entre monedas, medida con la tasa y señalada sin ella (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    await loginAs(page, origin, admin.email, password);
    const seededFrom = new Date();

    /** Lista de convenio en `currency` con la corona a `price`, asignada a un paciente con un plan en esa moneda. */
    async function listAgreementItem(letter: string, currency: string, price: number) {
      const list = await apiPost<{ id: string }>(page.request, session, '/price-lists', {
        name: `Lista ${currency} ${tag}`.slice(0, 60),
        currency,
      });
      const priced = await page.request.put(`${API_URL}/price-lists/${list.id}/items`, {
        headers: session.headers,
        data: { items: [{ catalogItemId: procedureId, price }] },
      });
      expect(priced.ok(), await priced.text()).toBeTruthy();
      const payer = await apiPost<{ id: string }>(page.request, session, '/payers', {
        name: `Empresa ${currency} ${tag}`.slice(0, 60),
        type: 'OTHER',
      });
      const name = `Empresa ${currency} ${tag}`.slice(0, 120);
      const agreement = await apiPost<{ id: string }>(page.request, session, '/agreements', {
        name,
        payerId: payer.id,
        kind: 'PRICE_LIST',
        priceListId: list.id,
      });
      const target = await patientWithPlan(page, `${letter}${tag}`, currency);
      const assigned = await page.request.put(`${API_URL}/patients/${target.patientId}/agreement`, {
        headers: session.headers,
        data: { agreementId: agreement.id },
      });
      expect(assigned.ok(), await assigned.text()).toBeTruthy();
      // Sin precio: el de la lista. Nunca 422 por la tasa.
      const item = await apiPost<{
        price: number;
        basePriceInPlan: number | null;
        referenceRate: unknown;
        baseRate: { fromPerBase: number; toPerBase: number; source: string; rateDate: string } | null;
      }>(page.request, session, `/treatment-plans/${target.planId}/items`, {
        toothNumber: '21',
        catalogItemId: procedureId,
      });
      return { name, item, lastName: `Moneda${letter}${tag}`.slice(0, 40) };
    }

    // Con la tasa de VES del día: base 100 USD a 400 = 40.000 Bs., congelada.
    const measured = await listAgreementItem('l', 'VES', 30000);
    expect(measured.item).toMatchObject({
      price: 30000,
      basePriceInPlan: CONVERTED,
      referenceRate: null,
      baseRate: { fromPerBase: 1, toPerBase: VES_RATE, source: 'MANUAL' },
    });
    // L1: el día de la tasa es el que congeló el ítem (hoy o, si la prueba
    // cruzó la medianoche de la sede, mañana), no uno calculado aquí.
    const baseRateDay = measured.item.baseRate!.rateDate;
    expect([rateDay, sedeDay(new Date(Date.now() + DAY_MS)), sedeDay(new Date())]).toContain(baseRateDay);
    const rateText = `tasa 1 USD = ${sedeFmt.number(VES_RATE, { min: 0, max: 4 })} VES del ${sedeFmt.civilDate(baseRateDay)}, manual`;
    // Sin tasa de EUR: el alta funciona igual, sin base.
    const unmeasured = await listAgreementItem('e', 'EUR', 80);
    expect(unmeasured.item).toMatchObject({ price: 80, basePriceInPlan: null, baseRate: null });
    const seededTo = new Date();

    await page.goto(`${origin}/caja/descuentos`);
    await expect(page.getByRole('heading', { name: 'Descuentos', level: 1 })).toBeVisible({ timeout: 15_000 });
    await fillDateRange(
      page,
      'Periodo',
      sedeDay(new Date(seededFrom.getTime() - DAY_MS)),
      sedeDay(new Date(seededTo.getTime() + DAY_MS)),
    );
    const rows =
      viewport.width === 390
        ? page.getByRole('list', { name: 'Descuentos del periodo' }).getByRole('listitem')
        : page.getByRole('table', { name: 'Descuentos del periodo' }).getByRole('row');
    const measuredRow = rows.filter({ hasText: measured.lastName });
    await expect(measuredRow).toHaveCount(1);
    await expect(measuredRow).toContainText(`Convenio «${measured.name}»: −${sede(10000, 'VES')}`);
    await expect(measuredRow).toContainText(`de ${sede(CONVERTED, 'VES')})`);
    await expect(measuredRow).toContainText(`Catálogo ${sede(CATALOG_PRICE, 'USD')} · ${rateText}`);
    await expect(measuredRow).not.toContainText('VES = ');
    const unmeasuredRow = rows.filter({ hasText: unmeasured.lastName });
    await expect(unmeasuredRow).toHaveCount(1);
    await expect(unmeasuredRow).toContainText(
      `Convenio «${unmeasured.name}»: sin referencia comparable (catálogo en USD, plan en EUR)`,
    );
    await expect(unmeasuredRow).toContainText('Sin medir');
    await expect(page.getByTestId('agreement-unmeasured-EUR')).toContainText('de convenio sin referencia comparable');
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
  });
}

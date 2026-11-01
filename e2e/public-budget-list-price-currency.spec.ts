import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Browser, type Page } from './support/test';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailMark } from './support/mail';
import { E2E_BROWSER_LOCALE, E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-502): la página pública del presupuesto a distancia con un plan en
 * EUR y el catálogo en COP.
 *
 * Una clínica nueva con su única sede en COP (`E2E_REGION`) y una paciente
 * con un convenio de lista de precios en EUR: el ítem de un plan en EUR toma
 * 100,55 EUR de la lista del convenio y la API congela en él el precio de
 * catálogo (80.000) con SU moneda, COP. Se envía a aceptar y la paciente lo abre sin sesión:
 *
 *   - el precio de lista sale «COP 80.000,00», nunca «EUR 80.000,00»;
 *   - la nota dice que es el del catálogo, en COP, y que no se convierte;
 *   - no hay «Ahorro por convenio» (restaría COP de EUR);
 *   - el total sigue en EUR.
 * A 390 px (sin scroll horizontal) y a 1440 px.
 *
 * Estado: crea su propia clínica (no toca la demo). Necesita E2E_MAIL_DIR (el
 * enlace y el código llegan por email), como `remote-budget.spec.ts`.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `presup-eur-${suffix}`.slice(0, 40),
  clinicName: `Clínica Presupuesto EUR ${suffix}`,
  fullName: 'Dra. Euro',
  email: `presup.eur.${suffix}@example.com`,
  password: 'Password123!',
};
const PATIENT_EMAIL = `elena.eur.${suffix}@example.com`.slice(0, 60);
const PROCEDURE = `Corona DX502 ${suffix}`.slice(0, 40);
const CATALOG_PRICE = 80_000;
const LIST_PRICE_EUR = 100.55;
const AGREEMENT = `Convenio Euro ${suffix}`.slice(0, 60);

const sedeFmt = regionalFormat(E2E_REGION);
/** Importes de la página pública: formato de la sede y código ISO (DX-378). */
const sede = (amount: number, currency: string) => moneyWithCode(amount, currency, sedeFmt).replace(/\s/g, ' ');

let session: ApiSession;
let patientId = '';
let planId = '';

async function apiPut(request: APIRequestContext, headers: Record<string, string>, path: string, data: object) {
  const res = await request.put(`${API_URL}${path}`, { headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

/** Envía a aceptar el presupuesto y devuelve el enlace del email. */
async function sendBudget(request: APIRequestContext): Promise<string> {
  const since = mailMark();
  await apiPost(request, session, `/patients/${patientId}/signature-requests`, {
    type: 'BUDGET',
    channel: 'EMAIL',
    treatmentPlanId: planId,
  });
  return linkFromMail(PATIENT_EMAIL, /(https?:\/\/\S+\/firmar\/[A-Za-z0-9_-]{43})/, { since });
}

/** La paciente abre el enlace sin sesión, pide el código y ve el presupuesto. */
async function openBudget(browser: Browser, link: string, width: number): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    locale: E2E_BROWSER_LOCALE,
    viewport: { width, height: 900 },
    hasTouch: width < 640,
  });
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByText(/Para ver el presupuesto, te enviaremos un código/)).toBeVisible({ timeout: 15_000 });
  const since = mailMark();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  const code = await linkFromMail(PATIENT_EMAIL, /Tu código de verificación es: (\d{6})/, { since });
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button', { name: 'Ver el presupuesto' }).click();
  return { page, close: () => context.close() };
}

async function expectCatalogCurrency(page: Page): Promise<void> {
  const budget = page.getByRole('article', { name: 'Presupuesto y condiciones' });
  const items = budget.getByRole('list', { name: 'Procedimientos del presupuesto' });
  await expect(items).toContainText(PROCEDURE);
  const flat = async () => ((await budget.textContent()) ?? '').replace(/\s/g, ' ');
  // Precio de lista en COP; lo cobrado, en EUR.
  expect(await flat()).toContain(`Precio de lista ${sede(CATALOG_PRICE, 'COP')}`);
  expect(await flat()).not.toContain(sede(CATALOG_PRICE, 'EUR'));
  expect(((await items.textContent()) ?? '').replace(/\s/g, ' ')).toContain(sede(LIST_PRICE_EUR, 'EUR'));
  await expect(page.getByTestId('public-budget-list-price-note')).toHaveText(
    'El precio de lista es el del catálogo de la clínica, en COP: es de referencia y no se convierte a EUR.',
  );
  await expect(budget.getByText('Ahorro por convenio')).toHaveCount(0);
  await expect(budget).toContainText('Total (EUR)');
}

test.describe.configure({ mode: 'serial' });

test.describe('Presupuesto a distancia: precio de lista en la moneda del catálogo (DX-502)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');

  test.beforeAll(async ({ request }) => {
    session = await registerClinicViaApi(request, clinic);
    expect(E2E_REGION.currency).toBe('COP');
    const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
    expect(locations.ok()).toBeTruthy();
    const [location] = (await locations.json()) as { id: string; currency: string }[];
    expect(location.currency).toBe('COP');

    const catalogItem = await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `dx502-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: PROCEDURE,
      color: '#3366CC',
      defaultPrice: CATALOG_PRICE,
    });
    // Convenio con lista de precios en EUR: el precio pactado sale de ella.
    const list = await apiPost<{ id: string }>(request, session, '/price-lists', {
      name: `Convenio EUR ${suffix}`.slice(0, 120),
      currency: 'EUR',
    });
    await apiPut(request, session.headers, `/price-lists/${list.id}/items`, {
      items: [{ catalogItemId: catalogItem.id, price: LIST_PRICE_EUR }],
    });
    const payer = await apiPost<{ id: string }>(request, session, '/payers', {
      name: `Aseguradora ${suffix}`.slice(0, 80),
      type: 'PUBLIC_SYSTEM',
    });
    const agreement = await apiPost<{ id: string }>(request, session, '/agreements', {
      name: AGREEMENT,
      payerId: payer.id,
      kind: 'PRICE_LIST',
      priceListId: list.id,
    });
    ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Elena',
      lastName: `Euro${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `DX502${suffix}`.slice(0, 20),
      sex: 'F',
      email: PATIENT_EMAIL,
      birthDate: '1990-03-14',
    }));
    const coverage = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/coverages`, {
      payerId: payer.id,
      memberNumber: `AF-${suffix}`.slice(0, 30),
    });
    await apiPut(request, session.headers, `/patients/${patientId}/agreement`, {
      agreementId: agreement.id,
      coverageId: coverage.id,
    });
    ({ id: planId } = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
      currency: 'EUR',
    }));
    const item = await apiPost<{
      price: number;
      basePrice: number | null;
      catalogCurrency: string | null;
      priceSource: string;
    }>(
      request,
      session,
      `/treatment-plans/${planId}/items`,
      { toothNumber: '21', catalogItemId: catalogItem.id },
    );
    // La API congela la moneda del catálogo con su precio (DX-502).
    expect(item).toMatchObject({
      price: LIST_PRICE_EUR,
      basePrice: CATALOG_PRICE,
      catalogCurrency: 'COP',
      priceSource: 'AGREEMENT_PRICE_LIST',
    });
    await apiPost(request, session, `/treatment-plans/${planId}/present`, {});
  });

  test('a 390 px: precio de lista en COP con la nota, sin ahorro y sin scroll horizontal', async ({ browser, request }) => {
    const link = await sendBudget(request);
    const { page, close } = await openBudget(browser, link, 390);
    try {
      await expectCatalogCurrency(page);
      await expectNoHorizontalScroll(page);
    } finally {
      await close();
    }
  });

  test('a 1440 px: lo mismo', async ({ browser, request }) => {
    const link = await sendBudget(request);
    const { page, close } = await openBudget(browser, link, 1440);
    try {
      await expectCatalogCurrency(page);
    } finally {
      await close();
    }
  });
});

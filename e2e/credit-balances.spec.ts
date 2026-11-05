import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-430): Cartera › «Saldo a favor» a 1440 y 390 px. Una clínica nueva
 * por corrida (sede en USD): «Ana» tiene USD 300 abonados a un plan cancelado
 * (USD 300 a favor); «Beto», un plan vivo pagado de más (USD 25). La lista
 * coincide con el estado de cuenta de cada uno; tras devolver todo el saldo de
 * Ana, ya no sale. DENTIST no ve la sección. Requiere los dos servidores.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const admin = { fullName: 'Ada Admin', email: `ada.sf430.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.sf430.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Daniel', email: `daniel.sf430.${suffix}@example.com` };
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const PAID_DAY = '2026-09-01';
const LIST = 'Pacientes con saldo a favor';

let session: ApiSession;
let anaId = '';
let anaPlan = '';
let anaPayment = '';
let sede: { id: string; name: string } = { id: '', name: '' };
const origin = tenantOrigin(`test-clinic-sf430-${suffix}`);

async function patient(request: APIRequestContext, firstName: string): Promise<string> {
  return (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName,
      lastName: `Favor${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `${firstName.slice(0, 2)}${suffix}`,
      sex: 'F',
    })
  ).id;
}

async function plan(request: APIRequestContext, patientId: string, price: number, code: string): Promise<string> {
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `${code}-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Corona ${code}`,
    color: '#3366CC',
    defaultPrice: price,
  });
  const created = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${created.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${created.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok()).toBeTruthy();
  return created.id;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain: `test-clinic-sf430-${suffix}`,
    clinicName: `Clinica Saldo 430 ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });

  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  expect(locations.ok()).toBeTruthy();
  const [main] = (await locations.json()) as { id: string; name: string }[];
  sede = { id: main.id, name: main.name };

  anaId = await patient(request, 'Ana');
  anaPlan = await plan(request, anaId, 500, 'a');
  anaPayment = (
    await apiPost<{ id: string }>(request, session, `/treatment-plans/${anaPlan}/payments`, {
      amount: 300,
      currency: 'USD',
      paidAt: PAID_DAY,
      method: 'TRANSFER',
    })
  ).id;
  const cancel = await request.patch(`${API_URL}/treatment-plans/${anaPlan}`, {
    headers: session.headers,
    data: { status: 'CANCELLED' },
  });
  expect(cancel.ok()).toBeTruthy();

  const betoId = await patient(request, 'Beto');
  const betoPlan = await plan(request, betoId, 100, 'b');
  await apiPost(request, session, `/treatment-plans/${betoPlan}/payments`, {
    amount: 125,
    currency: 'USD',
    paidAt: PAID_DAY,
    method: 'TRANSFER',
  });
});

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

/**
 * `DataList` pinta una tabla (role table/row) desde 640 px y, por debajo, una
 * lista de tarjetas (role list/listitem): el mismo nombre accesible en las dos.
 */
function creditList(scope: Page | Locator, width: number): Locator {
  return scope.getByRole(width < 640 ? 'list' : 'table', { name: LIST });
}
function creditRows(scope: Page | Locator, width: number): Locator {
  return creditList(scope, width).getByRole(width < 640 ? 'listitem' : 'row');
}

/**
 * Ni la barra lateral (≥ 768 px) ni la barra inferior ni su hoja «Más» (teléfono)
 * ofrecen «Cartera»: se comprueba con un enlace que SÍ está para que no pase en vacío.
 */
async function expectNoCarteraInMenu(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 768) {
    const sidebar = page.getByRole('navigation', { name: 'Secciones' });
    await expect(sidebar.getByRole('link', { name: 'Agenda', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(sidebar.getByRole('link', { name: 'Cartera', exact: true })).toHaveCount(0);
    return;
  }
  const bottomBar = page.getByRole('navigation', { name: 'Principal' });
  await expect(bottomBar).toBeVisible({ timeout: 15_000 });
  await expect(bottomBar.getByRole('link', { name: 'Cartera', exact: true })).toHaveCount(0);
  await bottomBar.getByRole('button', { name: 'Más', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'Más' }).getByRole('navigation', { name: 'Más' });
  await expect(more.getByRole('link').first()).toBeVisible();
  await expect(more.getByRole('link', { name: 'Cartera', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
}

for (const viewport of VIEWPORTS) {
  test(`ADMIN: la pestaña «Saldo a favor» lista a Ana y a Beto con su importe y su antigüedad (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/caja/cartera`);
    await page.getByRole('tab', { name: 'Saldo a favor' }).click();
    await expect(page).toHaveURL(/\/caja\/cartera\?tab=saldo-a-favor$/);
    await expect(page.getByRole('tab', { name: 'Saldo a favor' })).toHaveAttribute('aria-selected', 'true');

    const ana = creditRows(page, viewport.width).filter({ hasText: `Ana Favor${suffix}` });
    await expect(ana).toHaveCount(1, { timeout: 15_000 });
    await expect(ana).toContainText(money(300));
    await expect(ana).toContainText(fmt.civilDate(PAID_DAY));
    const beto = creditRows(page, viewport.width).filter({ hasText: `Beto Favor${suffix}` });
    await expect(beto).toContainText(money(25));
    // De mayor a menor importe: Ana (300) antes que Beto (25).
    const names = await creditRows(page, viewport.width).allInnerTexts();
    expect(names.findIndex((t) => t.includes('Ana'))).toBeLessThan(names.findIndex((t) => t.includes('Beto')));
    await expect(page.getByText('2 saldos a favor')).toBeVisible();

    // La fila abre el estado de cuenta del paciente.
    await expect(ana.getByRole('link', { name: new RegExp(`^Ana Favor${suffix}`) })).toHaveAttribute(
      'href',
      `/patients/${anaId}?tab=account-statement`,
    );

    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, page.getByRole('tabpanel'));
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });

  test(`el importe de la lista es el del estado de cuenta (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    const res = await page.request.get(`${API_URL}/patients/${anaId}/account-statement`, { headers: session.headers });
    expect(res.ok()).toBeTruthy();
    const statement = (await res.json()) as { plans: { id: string; balance: number }[] };
    const credit = -(statement.plans.find((p) => p.id === anaPlan)?.balance ?? 0);
    expect(credit).toBe(300);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(
      creditRows(page, viewport.width).filter({ hasText: `Ana Favor${suffix}` }),
    ).toContainText(money(credit), { timeout: 15_000 });
  });

  test(`RECEPTION ve la sección (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(
      creditRows(page, viewport.width).filter({ hasText: `Ana Favor${suffix}` }),
    ).toHaveCount(1, { timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test(`DENTIST no tiene Cartera en el menú y por URL ve el aviso de rol (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, dentist.email, password);
    await expectNoCarteraInMenu(page);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(page.getByText('Tu rol no tiene acceso a la cartera.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText(`Ana Favor${suffix}`)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test(`error al cargar: «Reintentar» recupera la lista (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let failures = 1;
    await page.route('**/receivables/credit-balances**', async (route) => {
      if (failures > 0) {
        failures -= 1;
        await route.fulfill({ status: 500, json: { message: 'Internal server error' } });
        return;
      }
      await route.continue();
    });
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(page.getByText('No pudimos cargar los saldos a favor.')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(
      creditRows(page, viewport.width).filter({ hasText: `Ana Favor${suffix}` }),
    ).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });

  test(`«Cargar más» añade la página siguiente (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const fake = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => ({
        patient: { id: randomUUID(), fullName: `Paciente Falso ${from + i}` },
        location: sede,
        currency: 'USD',
        amount: 1000 - (from + i),
        since: PAID_DAY,
        ageDays: 10,
      }));
    await page.route('**/receivables/credit-balances**', async (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') ?? '1');
      await route.fulfill({
        json: {
          asOf: '2026-11-03',
          scope: { location: null },
          items: pageNumber === 1 ? fake(1, 25) : fake(26, 30),
          total: 30,
          page: pageNumber,
          pageSize: 25,
          totals: [],
          paymentsWithoutRateCount: 0,
          rateProviderTimedOut: false,
        },
      });
    });
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(page.getByText('Se muestran 25 de 30.')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(page.getByText('Se añadieron 5 saldos a la lista.')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
    await expect(
      creditRows(page, viewport.width).filter({ hasText: 'Paciente Falso 30' }),
    ).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });
}

test('tras devolver todo el saldo, la paciente ya no sale (1440 y 390 px)', async ({ page, request }) => {
  const refund = await request.post(`${API_URL}/treatment-plans/${anaPlan}/credit-refunds`, {
    headers: session.headers,
    data: {
      amount: 300,
      currency: 'USD',
      method: 'TRANSFER',
      reason: 'El paciente se muda de ciudad',
      paymentIds: [anaPayment],
    },
  });
  expect(refund.ok(), `devolución falló: ${await refund.text()}`).toBeTruthy();
  await loginAs(page, origin, admin.email, password);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(creditRows(page, viewport.width).filter({ hasText: `Beto Favor${suffix}` })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByText(`Ana Favor${suffix}`)).toHaveCount(0);
    await expect(page.getByText('1 saldo a favor')).toBeVisible();
  }
});

for (const viewport of VIEWPORTS) {
  test(`sin nadie con saldo a favor: «Ningún paciente con saldo a favor» (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/receivables/credit-balances**', (route) =>
      route.fulfill({
        json: {
          asOf: '2026-11-03',
          scope: { location: null },
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
          totals: [],
          paymentsWithoutRateCount: 0,
          rateProviderTimedOut: false,
        },
      }),
    );
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/caja/cartera?tab=saldo-a-favor`);
    await expect(page.getByText('Ningún paciente con saldo a favor')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, page.getByRole('tabpanel'));
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });
}

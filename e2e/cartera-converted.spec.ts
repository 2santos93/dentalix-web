import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from './support/test';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { sedeDayFromToday } from './support/clock';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * e2e (DX-472-bis): la cartera y el selector de cobro cuentan lo abonado en
 * otra moneda convertido, como el estado de cuenta. Una clínica nueva por
 * corrida, con sede en USD, tasa MANUAL y la de hoy registrada: 36 VES por
 * USD. Tres pacientes con un plan en USD:
 *
 *  - «Saldada»: USD 100 pagados con Bs 3.600 hoy. Saldo 0: no sale en la
 *    cartera (antes salía debiendo USD 100 y con Bs 3.600 a favor).
 *  - «Parcial»: USD 300 con Bs 3.600 hoy. La cartera dice USD 200 por cobrar,
 *    sin bolívares a favor; el selector de cobro, saldo USD 200.
 *  - «Sintasa»: USD 100 con Bs 3.600 de ayer, día sin tasa (la suite no tiene
 *    proveedor). La cartera avisa «1 abono sin tasa» y marca la fila.
 *
 * A 1440 y 390 px, sin desplazamiento lateral, y axe en claro y oscuro.
 *
 * DX-472-ter: Inicio avisa con los textos del estado de cuenta («1 abono sin
 * tasa» o «el proveedor no respondió», este con la respuesta de la API
 * interceptada: la suite no tiene proveedor), y el CSV de la cartera dice en
 * su última columna qué líneas están incompletas.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

let origin: string;
let adminEmail: string;
let lastName: string;
let partialId: string;

async function put(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.put(`${API_URL}${path}`, {
    headers: session.headers,
    data,
  });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

async function patch(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, {
    headers: session.headers,
    data,
  });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

/** Un paciente con un plan en USD de `price` y un abono de Bs `paid` el día `paidAt`. */
async function seedDebtor(
  request: APIRequestContext,
  admin: ApiSession,
  catalogItemId: string,
  firstName: string,
  price: number,
  paidAt: string,
): Promise<{ id: string; status: string }> {
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName,
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `V${firstName.slice(0, 2)}${rawSuffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId,
    price,
  });
  await patch(request, admin, `/treatment-plans/${plan.id}/items/${item.id}`, {
    status: 'ACCEPTED',
  });
  const payment = await apiPost<{ exchangeRateStatus: string }>(
    request,
    admin,
    `/treatment-plans/${plan.id}/payments`,
    { amount: 3600, currency: 'VES', paidAt, method: 'CASH' },
  );
  return { id: patient.id, status: payment.exchangeRateStatus };
}

test.beforeAll(async ({ playwright }) => {
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.cartera.${suffix}@example.com`;
  lastName = `Cartera${suffix.slice(0, 6)}`;
  const request = await playwright.request.newContext();
  try {
    const admin = await registerClinicViaApi(request, {
      subdomain: `cartera472-${suffix}`,
      clinicName: `Clinica Cartera ${suffix}`,
      fullName: 'Dra Cartera',
      email: adminEmail,
      password,
      location: E2E_REGION,
    });
    origin = admin.origin;
    const today = sedeDayFromToday(0);
    await put(request, admin, '/exchange/settings', { source: 'MANUAL' });
    await apiPost(request, admin, '/exchange/manual-rates', {
      date: today,
      currency: 'VES',
      rate: 36,
    });
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `c472-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Resina-${suffix}`,
      color: '#3366CC',
      defaultPrice: 100,
    });

    const settled = await seedDebtor(request, admin, catalog.id, 'Saldada', 100, today);
    expect(settled.status, 'el abono de hoy debía congelar la tasa').toBe('FROZEN');
    const partial = await seedDebtor(request, admin, catalog.id, 'Parcial', 300, today);
    expect(partial.status).toBe('FROZEN');
    partialId = partial.id;
    const missing = await seedDebtor(request, admin, catalog.id, 'Sintasa', 100, sedeDayFromToday(-1));
    expect(missing.status, 'el abono de ayer debía quedar «sin tasa»').toBe('MISSING');
  } finally {
    await request.dispose();
  }
});

for (const viewport of VIEWPORTS) {
  test(`cartera: lo abonado en bolívares cuenta convertido y lo «sin tasa» se avisa (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, adminEmail, password);
    await page.goto(`${origin}/caja/cartera`);

    const notice = page.getByRole('status').filter({ hasText: '1 abono sin tasa' });
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('La cartera todavía no los cuenta: falta la tasa de cambio de su día.');

    const list = page.getByRole(viewport.width < 640 ? 'list' : 'table', {
      name: 'Deudores',
    });
    await expect(list).toContainText(`Parcial ${lastName}`);
    await expect(list).toContainText(`Sintasa ${lastName}`);
    // Saldada: USD 100 pagados con Bs 3.600 a tasa 36, nada que cobrar.
    await expect(list).not.toContainText(`Saldada ${lastName}`);

    const item = viewport.width < 640 ? 'listitem' : 'row';
    const partial = list.getByRole(item).filter({ hasText: `Parcial ${lastName}` });
    await expect(partial).toContainText(/200,00/);
    await expect(partial).not.toContainText('A favor');
    await expect(partial).not.toContainText('Cifras incompletas');
    const missing = list.getByRole(item).filter({ hasText: `Sintasa ${lastName}` });
    await expect(missing).toContainText('Cifras incompletas');

    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, notice);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });
}

for (const viewport of VIEWPORTS) {
  test(`Inicio: «sin tasa» con el texto del estado de cuenta (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, adminEmail, password);
    await page.goto(`${origin}/dashboard`);
    const section = page.getByRole('region', { name: 'Cartera por antigüedad' });
    const notice = section.getByRole('status').filter({ hasText: '1 abono sin tasa' });
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('El saldo todavía no los cuenta: falta la tasa de cambio de su día.');
    await expect(section.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, notice);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });

  test(`Inicio: el proveedor no respondió, con «Reintentar» (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Solo la primera respuesta dice «no respondió»; el reintento llega completo.
    let first = true;
    await page.route('**/receivables/aging/summary**', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      const timedOut = first;
      first = false;
      await route.fulfill({ response, json: { ...body, rateProviderTimedOut: timedOut } });
    });
    await loginAs(page, origin, adminEmail, password);
    await page.goto(`${origin}/dashboard`);
    const section = page.getByRole('region', { name: 'Cartera por antigüedad' });
    const notice = section.getByRole('status').filter({ hasText: 'El proveedor de tasas no respondió' });
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('El saldo todavía no cuenta 1 abono en otra moneda.');
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, notice);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
    await notice.getByRole('button', { name: 'Reintentar' }).click();
    await expect(section.getByRole('status').filter({ hasText: '1 abono sin tasa' })).toBeVisible({ timeout: 15_000 });
    await expect(notice).toHaveCount(0);
  });
}

test('CSV: la última columna dice qué líneas tienen cifras incompletas', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/caja/cartera`);
  await expect(page.getByRole('row', { name: new RegExp(`Sintasa ${lastName}`) })).toBeVisible({ timeout: 15_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  const { readFile } = await import('node:fs/promises');
  const lines = (await readFile((await download.path())!, 'utf8')).replace(/^\uFEFF/, '').trim().split('\r\n');
  expect(lines[0].split(',').at(-1)).toBe('Cifras incompletas');
  const lineOf = (name: string) => lines.find((l) => l.startsWith(`"${name} ${lastName}",`)) ?? '';
  expect(lineOf('Sintasa').split(',').at(-1)).toBe('"Sin tasa"');
  expect(lineOf('Parcial').split(',').at(-1)).toBe('');
});

test('cobro: el selector de plan da el saldo convertido del estado de cuenta', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/${partialId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await statement.getByRole('button', { name: 'Registrar abono' }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/^Saldo .*200,00 · Total .*300,00 · Abonado .*100,00/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByText(/^Entregado en otra moneda: .*3\.600,00/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

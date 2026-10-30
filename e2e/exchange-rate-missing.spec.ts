import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * e2e (DX-375): el aviso «sin tasa». Una clínica nueva por corrida, en tasa
 * MANUAL y sin ninguna tasa registrada; un plan en USD con un abono de hoy en
 * la moneda de la sede, que la API guarda «sin tasa».
 *
 *  1. ADMIN, plan de tratamiento: el aviso «1 abono sin tasa» va junto a las
 *     cifras, el abono lleva «Sin tasa» y el enlace lleva a Ajustes › Tasa de
 *     cambio, donde la tasa se registra y queda corregible (nadie la usó).
 *  2. RECEPCIÓN, estado de cuenta › «Ver por ítem»: el mismo aviso, sin enlace
 *     y diciendo que lo pida a un administrador.
 *  A 1440 y 390 px (sin desplazamiento lateral) y axe en claro y oscuro.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const LOCAL = E2E_REGION.currency;
const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

let origin: string;
let adminEmail: string;
let receptionEmail: string;
let patientId: string;

/** Hoy en la zona de la sede de e2e. */
function sedeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: E2E_REGION.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function put(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

async function patch(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

test.beforeAll(async ({ playwright }) => {
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.sintasa.${suffix}@example.com`;
  receptionEmail = `recepcion.sintasa.${suffix}@example.com`;
  const request = await playwright.request.newContext();
  try {
    const admin = await registerClinicViaApi(request, {
      subdomain: `sintasa-${suffix}`,
      clinicName: `Clinica Sin Tasa ${suffix}`,
      fullName: 'Dra Tasa',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    await addStaffViaApi(request, admin, {
      fullName: 'Recepción Tasa',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });
    // Tasa manual desde hoy y ninguna registrada: el abono de hoy en la moneda
    // de la sede no tiene tasa.
    await put(request, admin, '/exchange/settings', { source: 'MANUAL' });
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Ana',
      lastName: `SinTasa${suffix.slice(0, 6)}`,
      docType: 'NATIONAL_ID',
      docNumber: `ST${suffix}`.slice(0, 20),
      sex: 'F',
    });
    patientId = patient.id;
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `st-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Corona-${suffix}`,
      color: '#3366CC',
      defaultPrice: 1000,
    });
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });
    const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: '11',
      catalogItemId: catalog.id,
    });
    await patch(request, admin, `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
    const payment = await apiPost<{ exchangeRateStatus: string }>(
      request,
      admin,
      `/treatment-plans/${plan.id}/payments`,
      { amount: 200000, currency: LOCAL, paidAt: sedeToday(), method: 'CASH' },
    );
    expect(payment.exchangeRateStatus).toBe('MISSING');
  } finally {
    await request.dispose();
  }
});

async function openPlanTab(page: Page) {
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByText('1 abono sin tasa')).toBeVisible({ timeout: 15_000 });
  return panel;
}

for (const viewport of VIEWPORTS) {
  test(`ADMIN: el saldo del plan avisa «sin tasa» y enlaza a Ajustes › Tasa de cambio (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, adminEmail, password);
    const panel = await openPlanTab(page);
    const notice = panel.getByRole('status').filter({ hasText: '1 abono sin tasa' });
    await expect(notice).toContainText('El saldo todavía no los cuenta');
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, notice);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);

    // El abono lleva «Sin tasa» en la lista de abonos.
    const fold = panel.getByRole('button', { name: /^Abonos y saldo/ });
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await expect(panel.getByText(/^Sin tasa/).locator('visible=true').first()).toBeVisible();

    await notice.getByRole('link', { name: 'Registrar la tasa en Ajustes › Tasa de cambio' }).click();
    await expect(page).toHaveURL(/\/settings\/tasa-de-cambio$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tasa de cambio' })).toBeVisible();
  });
}

test('ADMIN: la tasa registrada desde el aviso se puede corregir mientras ningún abono la use', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/settings/tasa-de-cambio`);
  await page.getByRole('button', { name: 'Registrar tasa' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar tasa' });
  const currency = dialog.getByLabel('Moneda');
  await expect(currency.locator(`option[value="${LOCAL}"]`)).toHaveCount(1, { timeout: 15_000 });
  await currency.selectOption(LOCAL);
  await dialog.getByLabel(/^Tasa por 1 /).fill('4000');
  await dialog.getByRole('button', { name: 'Registrar tasa' }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByRole('table', { name: 'Tasas manuales' });
  await table.getByRole('button', { name: new RegExp(`^Corregir la tasa de ${LOCAL} del `) }).click();
  const correct = page.getByRole('dialog', { name: new RegExp(`^Corregir la tasa de ${LOCAL} del `) });
  await correct.getByLabel(/^Tasa por 1 /).fill('4100');
  await correct.getByRole('button', { name: 'Guardar tasa' }).click();
  await expect(correct).toBeHidden();
  await expect(page.getByText(`Tasa de ${LOCAL} corregida.`)).toBeVisible();
});

test('RECEPCIÓN: «Ver por ítem» avisa «sin tasa» sin enlace y dice a quién pedirla', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await loginAs(page, origin, receptionEmail, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  const toggle = statement.getByRole('button', { name: /^Ver por ítem/ });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();
  const notice = statement.getByRole('status').filter({ hasText: '1 abono sin tasa' });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText('Pide a un administrador que registre la tasa de ese día');
  await expect(notice.getByRole('link')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

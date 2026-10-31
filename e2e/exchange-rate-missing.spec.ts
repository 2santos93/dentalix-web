import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';
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
 *  3. DX-386, otra clínica con la fuente AUTOMÁTICA y sin tasa del proveedor
 *     (la suite no tiene clave): el aviso del ADMIN no invita a registrar una
 *     tasa manual; dice que la del proveedor aún no está y explica pasar a
 *     manual. El importe del abono va con el código ISO de la sede.
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
let autoOrigin: string;
let autoAdminEmail: string;
let autoPatientId: string;
/** DX-386: el abono con el formato de la sede y el código ISO («COP 200.000,00»). */
const PAYMENT_TEXT = moneyWithCode(200000, LOCAL, regionalFormat(E2E_REGION));

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

/** Un paciente con un plan en USD y un abono de hoy en la moneda de la sede, que la API guarda «sin tasa». */
async function seedPlanWithoutRate(request: APIRequestContext, admin: ApiSession, suffix: string): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Ana',
    lastName: `SinTasa${suffix.slice(0, 6)}`,
    docType: 'NATIONAL_ID',
    docNumber: `ST${suffix}`.slice(0, 20),
    sex: 'F',
  });
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
  expect(payment.exchangeRateStatus, 'el abono debía quedar «sin tasa»').toBe('MISSING');
  return patient.id;
}

test.beforeAll(async ({ playwright }) => {
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.sintasa.${suffix}@example.com`;
  receptionEmail = `recepcion.sintasa.${suffix}@example.com`;
  autoAdminEmail = `admin.sintasa.auto.${suffix}@example.com`;
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
    patientId = await seedPlanWithoutRate(request, admin, suffix);

    // DX-386: la fuente con la que empieza toda clínica (automática); sin
    // clave del proveedor en la suite, el día queda sin tasa.
    const autoAdmin = await registerClinicViaApi(request, {
      subdomain: `sintasa-auto-${suffix}`,
      clinicName: `Clinica Sin Tasa Auto ${suffix}`,
      fullName: 'Dra Auto',
      email: autoAdminEmail,
      password,
    });
    autoOrigin = autoAdmin.origin;
    autoPatientId = await seedPlanWithoutRate(request, autoAdmin, `a${suffix}`);
  } finally {
    await request.dispose();
  }
});

async function openPlanTab(page: Page, at = origin, patient = patientId) {
  await page.goto(`${at}/patients/${patient}?tab=treatment-plans`);
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
    // DX-386: el importe del abono con el código ISO y el formato de la sede, sin símbolo.
    await expect(panel.getByText(PAYMENT_TEXT).locator('visible=true').first()).toBeVisible();

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
  await table.getByRole('button', { name: new RegExp(`^Acciones de ${LOCAL} del `) }).click();
  await page.getByRole('menuitem', { name: 'Corregir' }).click();
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
  await expect(notice).toContainText('pide a un administrador que revise la tasa de cambio de ese día');
  await expect(notice.getByRole('link')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

for (const viewport of VIEWPORTS) {
  test(`ADMIN con fuente automática: el aviso dice que la tasa del proveedor aún no está y explica pasar a manual (${viewport.name})`, async ({
    page,
  }) => {
    // Solo cuentan los errores por leer la fuente (403 de /exchange/settings):
    // el 404 de un plan sin plan de pagos es la respuesta normal de esa ruta.
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (/\/treatment-plans\/[^/]+\/payment-plan(\?|$)/.test(msg.location().url) && msg.text().includes('404')) return;
      errors.push(`${msg.text()} ${msg.location().url}`);
    });
    page.on('response', (res) => {
      if (res.url().includes('/exchange/settings') && res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
    });
    await page.setViewportSize(viewport);
    await loginAs(page, autoOrigin, autoAdminEmail, password);
    const panel = await openPlanTab(page, autoOrigin, autoPatientId);
    const notice = panel.getByRole('status').filter({ hasText: '1 abono sin tasa' });
    await expect(notice).toContainText('La tasa del proveedor aún no está disponible; reintentamos solos', {
      timeout: 15_000,
    });
    await expect(notice).toContainText(PAYMENT_TEXT);
    await expect(notice.getByRole('link', { name: 'Registrar la tasa en Ajustes › Tasa de cambio' })).toHaveCount(0);
    const toManual = notice.getByRole('link', { name: 'Pasar a tasa manual en Ajustes › Tasa de cambio' });
    await expect(toManual).toBeVisible();
    await expect(notice).toContainText('servirá de respaldo a estos abonos si el proveedor no la da');
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, notice);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
    // Ningún 403 ni otro error en la consola por leer la fuente.
    expect(errors).toEqual([]);

    await toManual.click();
    await expect(page).toHaveURL(/\/settings\/tasa-de-cambio$/);
    await expect(page.getByTestId('exchange-rate-source')).toHaveText('Automática');
  });
}

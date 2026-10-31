import { test, expect, type APIRequestContext, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { E2E_DATABASE_URL } from './support/db';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { fillDate } from './support/dates';

/**
 * e2e (DX-376): cobro en otra moneda que la del plan. Plan en USD y dos abonos
 * en VES a dos tasas distintas (ayer 36,5 y hoy 40 VES por 1 USD, de la fuente
 * automática). Las tasas se dejan en la caché del proveedor por psql: en e2e
 * no hay clave del proveedor y la tasa manual solo rige desde hoy.
 *
 *  1. «Registrar abono» (estado de cuenta): antes de guardar, el equivalente
 *     en USD, la tasa con su fuente y su día y lo pendiente tras el abono, a
 *     1440 y 390 px sin desplazamiento lateral.
 *  2. Recibo de cada abono: «Tasa aplicada: 1 USD = … VES (automática, día)» y
 *     el equivalente; la reimpresión tras cambiar la tasa de ese día da lo
 *     mismo (la tasa congelada del abono, DX-375).
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const CURRENCY = 'VES';
const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

let origin: string;
let adminEmail: string;
let patientId: string;

/** Un día civil en la zona de la sede de e2e, `offset` días desde hoy. */
function sedeDay(offset = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: E2E_REGION.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offset * 86_400_000));
}
const TODAY = sedeDay();
const YESTERDAY = sedeDay(-1);
const ddmmyyyy = (day: string) => day.split('-').reverse().join('/');

/** La tasa de `CURRENCY` por 1 USD para `day` en la caché del proveedor. */
function setProviderRate(day: string, rate: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `day=${day}`, '-v', `cur=${CURRENCY}`, '-v', `rate=${rate}`],
    {
      input: `INSERT INTO exchange_rate_snapshots (id, date, currency, rate)
              VALUES (gen_random_uuid(), :'day', :'cur', :'rate'::numeric)
              ON CONFLICT (date, currency) DO UPDATE SET rate = EXCLUDED.rate;`,
    },
  );
}

async function patch(request: APIRequestContext, headers: Record<string, string>, path: string, data: object) {
  const res = await request.patch(path, { headers, data });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
  setProviderRate(YESTERDAY, 36.5);
  setProviderRate(TODAY, 40);
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.moneda.${suffix}@example.com`;
  const request = await playwright.request.newContext();
  try {
    const admin = await registerClinicViaApi(request, {
      subdomain: `moneda-${suffix}`,
      clinicName: `Clinica Moneda ${suffix}`,
      fullName: 'Dra Moneda',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Ana',
      lastName: `Moneda${suffix.slice(0, 6)}`,
      docType: 'NATIONAL_ID',
      docNumber: `MO${suffix}`.slice(0, 20),
      sex: 'F',
    });
    patientId = patient.id;
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `mo-${suffix}`,
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
    await patch(request, admin.headers, `${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
      status: 'ACCEPTED',
    });
  } finally {
    await request.dispose();
  }
});

/** Abre «Registrar abono» desde el estado de cuenta. */
async function openRecordPayment(page: Page) {
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await statement.getByRole('button', { name: 'Registrar abono' }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

async function payInVes(page: Page, amount: string, day: string, rateText: string, pending: RegExp) {
  const dialog = await openRecordPayment(page);
  const currency = dialog.getByLabel('Moneda');
  await expect(currency.locator(`option[value="${CURRENCY}"]`)).toHaveCount(1, { timeout: 15_000 });
  await currency.selectOption(CURRENCY);
  // UX v2: `DatePicker` por segmentos.
  await fillDate(dialog, 'Fecha de pago', day);
  await dialog.getByLabel('Importe').fill(amount);

  const preview = dialog.getByTestId('rp-rate-preview');
  await expect(preview).toContainText('Equivalente en USD');
  // DX-386: con el formato de la sede y el código ISO, como la tasa congelada.
  await expect(preview).toContainText(/USD\s50,00/);
  await expect(preview).not.toContainText('US$');
  await expect(preview).toContainText(`Tasa: 1 USD = VES ${rateText} · automática · ${ddmmyyyy(day)}`);
  await expect(preview).toContainText(pending);
  await expectNoHorizontalScroll(page);

  await dialog.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

for (const [index, viewport] of VIEWPORTS.entries()) {
  test(`«Registrar abono» en VES enseña equivalente, tasa y pendiente antes de guardar (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, adminEmail, password);
    if (index === 0) {
      // 1.825 VES a 36,5 = 50 USD (ayer); el plan de 1.000 USD queda en 950.
      await payInVes(page, '1825', YESTERDAY, '36,50', /Pendiente tras el abono\s*USD\s950,00/);
    } else {
      // 2.000 VES a 40 = 50 USD (hoy); queda en 900.
      await payInVes(page, '2000', TODAY, '40,00', /Pendiente tras el abono\s*USD\s900,00/);
    }
  });
}

test('el recibo de cada abono imprime su tasa congelada y la reimpresión no cambia aunque cambie la tasa', async ({
  page,
}) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  const fold = panel.getByRole('button', { name: /^Abonos registrados/ });
  await expect(fold).toBeVisible({ timeout: 15_000 });
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();

  const expectations = [
    { pair: '1 USD = 36,50 VES', day: YESTERDAY },
    { pair: '1 USD = 40,00 VES', day: TODAY },
  ];
  // UX v2: «Recibo» vive en el «⋯» de cada abono.
  const receipts = panel.getByRole('button', { name: /^Acciones de abono/ });
  await expect(receipts).toHaveCount(2);

  async function readReceipts(): Promise<string[]> {
    const texts: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await receipts.nth(i).click();
      await page.getByRole('menuitem', { name: 'Recibo' }).click();
      const doc = page.getByTestId('receipt-document');
      await expect(doc).toContainText('Tasa aplicada', { timeout: 15_000 });
      await expect(doc).toContainText(/Equivalente en USD/);
      // `formatCurrency` separa importe y moneda con un espacio duro (U+00A0):
      // se normaliza para comparar con el texto esperado.
      texts.push(((await doc.textContent()) ?? '').replace(/\s+/g, ' '));
      await page.keyboard.press('Escape');
      await expect(doc).toBeHidden();
    }
    return texts;
  }

  const first = await readReceipts();
  for (const { pair, day } of expectations) {
    expect(first.some((t) => t.includes(`Tasa aplicada: ${pair} (automática, ${ddmmyyyy(day)})`))).toBe(true);
  }

  // La tasa de ayer cambia después: la reimpresión usa la congelada del abono.
  setProviderRate(YESTERDAY, 50);
  await page.reload();
  const foldAgain = panel.getByRole('button', { name: /^Abonos registrados/ });
  if ((await foldAgain.getAttribute('aria-expanded')) !== 'true') await foldAgain.click();
  const again = await readReceipts();
  expect(again).toEqual(first);
});

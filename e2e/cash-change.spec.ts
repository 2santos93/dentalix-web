import { test, expect, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { E2E_DATABASE_URL } from './support/db';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * e2e (DX-570): vuelto al cobrar en efectivo, en otra moneda y por otro medio,
 * en un solo paso. El caso del ticket: el paciente paga 45 USD con un billete
 * de 50 y la clínica le devuelve 5 USD en bolívares por un medio digital que
 * pide referencia (tasa del día 36,5 VES por 1 USD, en la caché del proveedor).
 *
 *  1. «Registrar abono» con efectivo: «Recibido» 50, «Por devolver» 5,00 y el
 *     vuelto en VES calculado (182,50) con su equivalente y su tasa; claro y
 *     oscuro, 1440 y 390 px sin desplazamiento lateral y sin violaciones de axe.
 *  2. El recibo imprime recibido, aplicado y vuelto con su tasa y su fecha.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900, scheme: 'light' },
  { name: 'móvil', width: 390, height: 844, scheme: 'dark' },
] as const;

let origin: string;
let adminEmail: string;
let patientId: string;

/** Hoy en la zona de la sede de e2e (el día del abono y de su tasa). */
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: E2E_REGION.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const ddmmyyyy = (day: string) => day.split('-').reverse().join('/');

function setProviderRate(day: string, rate: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `day=${day}`, '-v', `rate=${rate}`], {
    input: `INSERT INTO exchange_rate_snapshots (id, date, currency, rate)
            VALUES (gen_random_uuid(), :'day', 'VES', :'rate'::numeric)
            ON CONFLICT (date, currency) DO UPDATE SET rate = EXCLUDED.rate;`,
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
  setProviderRate(TODAY, 36.5);
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.vuelto.${suffix}@example.com`;
  const request = await playwright.request.newContext();
  try {
    const admin = await registerClinicViaApi(request, {
      subdomain: `vuelto-${suffix}`,
      clinicName: `Clinica Vuelto ${suffix}`,
      fullName: 'Dra Vuelto',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    await apiPost(request, admin, '/payment-methods', {
      name: 'Pago móvil',
      kind: 'DIGITAL',
      requiresReference: true,
    });
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Luis',
      lastName: `Vuelto${suffix.slice(0, 6)}`,
      docType: 'NATIONAL_ID',
      docNumber: `VU${suffix}`.slice(0, 20),
      sex: 'M',
    });
    patientId = patient.id;
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `vu-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Resina-${suffix}`,
      color: '#3366CC',
      defaultPrice: 500,
    });
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });
    const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: '21',
      catalogItemId: catalog.id,
    });
    const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
      headers: admin.headers,
      data: { status: 'ACCEPTED' },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  } finally {
    await request.dispose();
  }
});

async function openRecordPayment(page: Page) {
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await statement.getByRole('button', { name: 'Registrar abono' }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

for (const [index, viewport] of VIEWPORTS.entries()) {
  test(`cobro de 45 USD con 50 recibidos y vuelto de 5 USD en VES por pago móvil (${viewport.name}, ${viewport.scheme})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.scheme });
    await loginAs(page, origin, adminEmail, password);
    const dialog = await openRecordPayment(page);
    await dialog.getByLabel('Importe', { exact: true }).fill('45');
    const method = dialog.getByLabel('Método');
    await expect(method.locator('option', { hasText: 'Efectivo' })).toHaveCount(1, { timeout: 15_000 });
    await method.selectOption({ label: 'Efectivo' });

    await dialog.getByLabel('Recibido').fill('50');
    const line = dialog.getByRole('group', { name: 'Vuelto 1' });
    await expect(line).toBeVisible();
    await expect(dialog.getByText('Por devolver')).toBeVisible();
    await line.getByLabel('Entregado por').selectOption({ label: 'Pago móvil' });
    await line.getByLabel('Moneda').selectOption('VES');
    await expect(line.getByLabel('Importe')).toHaveValue('182.50', { timeout: 15_000 });
    await expect(line).toContainText(/Equivale a USD\s5,00 · 1 USD = VES\s36,50/);
    await line.getByLabel('Referencia (obligatoria)').fill(`0412${index}5551234`);

    await expectNoHorizontalScroll(page);
    expect(await axeViolations(page, dialog)).toEqual([]);

    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(/Recibido USD\s50,00 · vuelto VES\s182,50 \(Pago móvil\)/)).toBeVisible();
  });
}

test('el recibo muestra recibido, aplicado y vuelto con su tasa y su fecha', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  const fold = panel.getByRole('button', { name: /^Abonos registrados/ });
  await expect(fold).toBeVisible({ timeout: 15_000 });
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
  await panel.getByRole('button', { name: /^Acciones de abono/ }).first().click();
  await page.getByRole('menuitem', { name: 'Recibo' }).click();
  const block = page.getByTestId('receipt-cash-change');
  await expect(block).toBeVisible({ timeout: 15_000 });
  const text = ((await block.textContent()) ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('Recibido');
  expect(text).toMatch(/USD 50,00/);
  expect(text).toContain('Aplicado al plan');
  expect(text).toMatch(/USD 45,00/);
  expect(text).toContain('Vuelto · Pago móvil');
  expect(text).toMatch(/−VES 182,50/);
  expect(text).toContain(`1 USD = VES 36,50 del ${ddmmyyyy(TODAY)}`);
});

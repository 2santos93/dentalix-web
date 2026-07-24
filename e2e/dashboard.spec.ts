import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';

/**
 * e2e: register clinic + login (owner, `DASHBOARD_ROLES` includes OWNER —
 * see `dashboard.controller.ts`), seed the minimum data needed for every
 * `/dashboard` card via the REAL API (owner's just-issued token, all on the
 * tenant's `${subdomain}.localhost:3001` host so `X-Tenant-Host` matches):
 *   - a patient (`POST /patients`);
 *   - an inventory item with `minStock > 0` and NO movement recorded, so
 *     `ListInventoryItemsUseCase` resolves its `stock` to 0 and
 *     `lowStock = stock <= minStock` is true (`list-inventory-items.use-
 *     case.ts`) — no need to touch the movements endpoint at all;
 *   - a sale in USD, `paidAt` today, one line item (`POST /sales`);
 *   - a future appointment a few days out, `providerId` = the owner's own
 *     `userId` from `GET /staff` (`POST /appointments`).
 * ...then loads `/dashboard` (default period = current month..today,
 * inclusive "Hasta" thanks to `addOneDayIso`; default currency USD) and
 * asserts each of the 4 cards renders the seeded data:
 *   - "Ventas del período": the sale's total (Intl `es`/USD-formatted, same
 *     formatter as `DashboardView`'s `currencyFormatter`) and "1 venta";
 *   - "Bajo stock": "1 ítem" and the seeded item's name;
 *   - "Próximas citas": the seeded appointment's formatted time, its
 *     "Agendada" status badge, and — since v1 doesn't resolve patient names
 *     (see the plan's "Notas": nice-to-have, id is an acceptable v1
 *     fallback) — the `Paciente {id.slice(0,8)}` fallback text
 *     (`UpcomingAppointmentsCard`) built from the very patient we seeded;
 *   - "# Pacientes": exactly 1 (brand-new clinic, only patient we created).
 *
 * OFFLINE by design: the sale's currency (USD) equals the dashboard's query
 * currency (USD), so `GetSalesTotalsUseCase` -> `ConvertAmountUseCase` takes
 * the `from === to` passthrough (`convert-amount.use-case.ts`) and returns
 * `{ result: amount, rateUsed: 1 }` WITHOUT calling `GetRatesForDateUseCase`
 * (i.e. never hits Open Exchange Rates) — no exchange-snapshot seeding
 * needed for this spec to be deterministic.
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Auth/tenancy: same convention as `agenda.spec.ts` / `treatment-plans.spec.ts`
 * — the backend resolves the tenant from the REQUEST HOST, so the whole flow
 * (including the raw `page.request.post` seed calls) runs on
 * `http://${subdomain}.localhost:3001`, each seed call setting `X-Tenant-Host`
 * itself to match.
 *
 * Uniqueness: subdomain/email/patient last name/item name are suffixed with
 * `E2E_RUN_SUFFIX` (set by the `test:e2e` npm script) so repeated runs never
 * collide; a local `npx playwright test` falls back to `crypto.randomUUID()`.
 * `RegisterDto.subdomain` requires `/^[a-z0-9-]+$/`, so the suffix is kept
 * lowercase-alphanumeric only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Dashboard ${suffix}`;
const subdomain = `test-clinic-dash-${suffix}`;
const fullName = 'Test User';
const email = `test.user.dashboard.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Valentina';
const patientLastName = `Dashboard${suffix}`;
const patientDocNumber = `DOCDASH${suffix}`;

const inventoryItemName = `Alginato-${suffix}`;
const inventoryMinStock = 5;

const saleAmount = 250;

// Same formatter as `dashboard-view.tsx`'s `currencyFormatter` (es locale).
const currencyFormatter = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

// Same formatter as `dashboard-view.tsx`'s `formatTime`.
function formatTime(date: Date): string {
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

test('dashboard: aggregated cards render seeded sale, low-stock item, upcoming appointment and patient count', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });

  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  const accessToken =
    (JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } }).state?.accessToken ?? '';
  expect(accessToken).toBeTruthy();

  const seedHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };

  // --- Seed a patient ---
  const patientResponse = await page.request.post('http://localhost:3000/api/v1/patients', {
    headers: seedHeaders,
    data: {
      firstName: patientFirstName,
      lastName: patientLastName,
      docType: 'CC',
      docNumber: patientDocNumber,
      sex: 'F',
    },
  });
  expect(patientResponse.ok(), `Seeding the patient failed: ${await patientResponse.text()}`).toBeTruthy();
  const patient = (await patientResponse.json()) as { id: string };

  // --- Seed an inventory item with minStock > 0 and NO movement recorded,
  // so it resolves to `stock: 0` (below its minimum) -> low stock. ---
  const inventoryResponse = await page.request.post('http://localhost:3000/api/v1/inventory/items', {
    headers: seedHeaders,
    data: {
      name: inventoryItemName,
      unit: 'caja',
      minStock: inventoryMinStock,
    },
  });
  expect(
    inventoryResponse.ok(),
    `Seeding the inventory item failed: ${await inventoryResponse.text()}`,
  ).toBeTruthy();

  // --- Seed a sale in USD, paid today, one line item ---
  const saleResponse = await page.request.post('http://localhost:3000/api/v1/sales', {
    headers: seedHeaders,
    data: {
      patientId: patient.id,
      currency: 'USD',
      paidAt: new Date().toISOString(),
      lineItems: [{ description: `Consulta ${suffix}`, unitPrice: saleAmount, quantity: 1 }],
    },
  });
  expect(saleResponse.ok(), `Seeding the sale failed: ${await saleResponse.text()}`).toBeTruthy();

  // --- Resolve the owner's own userId (provider for the appointment) ---
  const staffResponse = await page.request.get('http://localhost:3000/api/v1/staff', {
    headers: seedHeaders,
  });
  expect(staffResponse.ok(), `Listing staff failed: ${await staffResponse.text()}`).toBeTruthy();
  const staff = (await staffResponse.json()) as { userId: string; fullName: string; role: string }[];
  const owner = staff.find((member) => member.role === 'OWNER') ?? staff[0];
  expect(owner, 'Expected the registered owner to appear in GET /staff').toBeTruthy();

  // --- Seed a future appointment (a few days ahead, well inside the
  // dashboard's 90-day upcoming window) ---
  const appointmentStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const appointmentEnd = new Date(appointmentStart.getTime() + 30 * 60 * 1000);
  const appointmentResponse = await page.request.post('http://localhost:3000/api/v1/appointments', {
    headers: seedHeaders,
    data: {
      patientId: patient.id,
      providerId: owner.userId,
      start: appointmentStart.toISOString(),
      end: appointmentEnd.toISOString(),
      reason: `Control ${suffix}`,
    },
  });
  expect(
    appointmentResponse.ok(),
    `Seeding the appointment failed: ${await appointmentResponse.text()}`,
  ).toBeTruthy();

  // --- Load the dashboard (default period = current month..today inclusive,
  // default currency USD -> covers today's sale; USD->USD passthrough, no
  // exchange call) ---
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  // Wait past the loading skeleton into the real card grid.
  await expect(page.getByRole('heading', { name: 'Ventas del período' })).toBeVisible({ timeout: 10_000 });

  // --- "Ventas del período": total + count ---
  const salesHeading = page.getByRole('heading', { name: 'Ventas del período' });
  const salesCard = salesHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(salesCard.getByText(formatCurrency(saleAmount), { exact: true }).first()).toBeVisible();
  await expect(salesCard.getByText('1 venta', { exact: true })).toBeVisible();

  // --- "Bajo stock": count + seeded item name ---
  const lowStockHeading = page.getByRole('heading', { name: 'Bajo stock' });
  const lowStockCard = lowStockHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(lowStockCard.getByText('1 ítem', { exact: true })).toBeVisible();
  await expect(lowStockCard.getByText(inventoryItemName, { exact: true })).toBeVisible();

  // --- "Próximas citas": the seeded appointment (time + status badge +
  // patient-id fallback, since v1 shows the id, not the resolved name) ---
  const upcomingHeading = page.getByRole('heading', { name: 'Próximas citas' });
  const upcomingCard = upcomingHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(upcomingCard.getByText(formatTime(appointmentStart), { exact: true })).toBeVisible();
  await expect(upcomingCard.getByText(`Paciente ${patient.id.slice(0, 8)}`, { exact: true })).toBeVisible();
  await expect(upcomingCard.getByText('Agendada', { exact: true })).toBeVisible();

  // --- "# Pacientes": exactly the one patient we created ---
  const patientCountHeading = page.getByRole('heading', { name: '# Pacientes' });
  const patientCountCard = patientCountHeading.locator(
    'xpath=ancestor::div[contains(@class,"rounded-xl")][1]',
  );
  await expect(patientCountCard.getByText('1', { exact: true })).toBeVisible();
});

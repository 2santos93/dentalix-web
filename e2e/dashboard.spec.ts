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
 *   - a treatment plan for the patient (`POST /patients/:id/treatment-
 *     plans`), one billable item (`POST /treatment-plans/:id/items`, priced,
 *     status flipped to DONE via `PATCH .../items/:itemId`), and an abono
 *     recorded against the plan in COP, `paidAt` today (`POST
 *     /treatment-plans/:id/payments`) — this is what the dashboard's
 *     "Ingresos del período" card now sums (PAY-T4: sales/`/sales` removed,
 *     incomes are sourced from payments, see `get-payments-totals.use-
 *     case.ts`);
 *   - a future appointment a few days out, `providerId` = the owner's own
 *     `userId` from `GET /staff` (`POST /appointments`).
 * ...then loads `/dashboard` (default period = current month..today,
 * inclusive "Hasta" thanks to `addOneDayIso`; default currency COP) and
 * asserts each of the 4 cards renders the seeded data:
 *   - "Ingresos del período": the abono's total (Intl `es`/COP-formatted,
 *     same formatter as `DashboardView`'s `currencyFormatter`) and "1 abono";
 *   - "Bajo stock": "1 ítem" and the seeded item's name;
 *   - "Próximas citas": the seeded appointment's formatted time, its
 *     "Agendada" status badge, and the resolved patient name (the card now
 *     looks up `patientNames`/`staffNames` and renders "{patient} · {provider}",
 *     falling back to the raw id only when a name lookup misses);
 *   - "# Pacientes": exactly 1 (brand-new clinic, only patient we created).
 *
 * OFFLINE by design: the abono's currency (COP) equals the dashboard's
 * default query currency (COP), so `GetPaymentsTotalsUseCase` ->
 * `ConvertAmountUseCase` takes the `from === to` passthrough
 * (`convert-amount.use-case.ts`) and returns `{ result: amount, rateUsed: 1 }`
 * WITHOUT calling `GetRatesForDateUseCase` (i.e. never hits Open Exchange
 * Rates) — no exchange-snapshot seeding needed for this spec to be
 * deterministic. (A mismatched currency would force a conversion the offline
 * E2E backend can't resolve → 500 → cards never render.)
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
 * Uniqueness: subdomain/email/patient last name/item name/catalog code are
 * suffixed with `E2E_RUN_SUFFIX` (set by the `test:e2e` npm script) so
 * repeated runs never
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

// Catalog item seeded via API (needed by `POST /treatment-plans/:id/items`,
// same convention as `treatment-plans.spec.ts`).
const catalogCode = `dash-resina-${suffix}`;
const catalogLabel = `Dash-Resina-${suffix}`;
const catalogColor = '#3366CC';
const itemPrice = 250;

const paymentAmount = 250;

// The income amount is asserted against a value formatted INSIDE the browser
// (see `page.evaluate` below), not with a Node-side `Intl.NumberFormat`: COP's
// fraction-digit default differs between Node's and Chromium's ICU builds
// (Node → "250,00 COP", Chromium → "250 COP"), so a Node-formatted string
// would never match the DOM. Formatting in-page uses the same engine the app
// uses (`dashboard-view.tsx`'s `formatCurrencySafe`, es locale).

// Same formatter as `dashboard-view.tsx`'s `formatTime`.
function formatTime(date: Date): string {
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

test('dashboard: aggregated cards render seeded payment income, low-stock item, upcoming appointment and patient count', async ({
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

  // --- Seed a treatment plan + a billable (DONE) item + an abono against
  // it, in USD, paid today — this is what "Ingresos del período" now sums
  // (PAY-T4: `/sales` is gone, incomes are sourced from payments) ---
  const catalogResponse = await page.request.post('http://localhost:3000/api/v1/catalog/items', {
    headers: seedHeaders,
    data: {
      code: catalogCode,
      kind: 'PROCEDURE',
      labelEs: catalogLabel,
      color: catalogColor,
      defaultPrice: itemPrice,
    },
  });
  expect(
    catalogResponse.ok(),
    `Seeding the catalog item failed: ${await catalogResponse.text()}`,
  ).toBeTruthy();
  const catalogItem = (await catalogResponse.json()) as { id: string };

  const planResponse = await page.request.post(
    `http://localhost:3000/api/v1/patients/${patient.id}/treatment-plans`,
    {
      headers: seedHeaders,
      data: {},
    },
  );
  expect(planResponse.ok(), `Seeding the treatment plan failed: ${await planResponse.text()}`).toBeTruthy();
  const plan = (await planResponse.json()) as { id: string };

  const itemResponse = await page.request.post(
    `http://localhost:3000/api/v1/treatment-plans/${plan.id}/items`,
    {
      headers: seedHeaders,
      data: {
        toothNumber: '11',
        catalogItemId: catalogItem.id,
        price: itemPrice,
      },
    },
  );
  expect(itemResponse.ok(), `Seeding the plan item failed: ${await itemResponse.text()}`).toBeTruthy();
  const planItem = (await itemResponse.json()) as { id: string };

  const markDoneResponse = await page.request.patch(
    `http://localhost:3000/api/v1/treatment-plans/${plan.id}/items/${planItem.id}`,
    {
      headers: seedHeaders,
      data: { status: 'DONE' },
    },
  );
  expect(
    markDoneResponse.ok(),
    `Marking the plan item DONE failed: ${await markDoneResponse.text()}`,
  ).toBeTruthy();

  const paymentResponse = await page.request.post(
    `http://localhost:3000/api/v1/treatment-plans/${plan.id}/payments`,
    {
      headers: seedHeaders,
      data: {
        amount: paymentAmount,
        // COP so it equals the dashboard's default query currency — keeps the
        // conversion a `from === to` passthrough (offline, no exchange call).
        currency: 'COP',
        paidAt: new Date().toISOString(),
      },
    },
  );
  expect(paymentResponse.ok(), `Seeding the payment failed: ${await paymentResponse.text()}`).toBeTruthy();

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
  // default currency USD -> covers today's abono; USD->USD passthrough, no
  // exchange call) ---
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  // Wait past the loading skeleton into the real card grid.
  await expect(page.getByRole('heading', { name: 'Ingresos del período' })).toBeVisible({ timeout: 10_000 });

  // --- "Ingresos del período": total + count ---
  // Format the expected amount with the browser's own Intl (same ICU as the
  // app) — a Node-side format wouldn't match COP's fraction digits.
  const expectedIncome = await page.evaluate(
    (amount) => new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' }).format(amount),
    paymentAmount,
  );
  const incomesHeading = page.getByRole('heading', { name: 'Ingresos del período' });
  const incomesCard = incomesHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(incomesCard.getByText(expectedIncome, { exact: true }).first()).toBeVisible();
  await expect(incomesCard.getByText('1 abono', { exact: true })).toBeVisible();

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
  // The card now resolves the real patient name (and provider), rendered as
  // "{patient} · {provider}" in one node — substring-match the patient name.
  await expect(upcomingCard.getByText(`${patientFirstName} ${patientLastName}`)).toBeVisible();
  await expect(upcomingCard.getByText('Agendada', { exact: true })).toBeVisible();

  // --- "# Pacientes": exactly the one patient we created ---
  const patientCountHeading = page.getByRole('heading', { name: '# Pacientes' });
  const patientCountCard = patientCountHeading.locator(
    'xpath=ancestor::div[contains(@class,"rounded-xl")][1]',
  );
  await expect(patientCountCard.getByText('1', { exact: true })).toBeVisible();
});

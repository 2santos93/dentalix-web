import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { accessTokenOf, loginAs, registerAndLogin } from './support/auth';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { regionalFormat } from '../src/lib/format/regional-format';
import { disableBusinessHours } from './support/business-hours';
import { API_URL } from './support/urls';
import { SEDE_TODAY_TZ, sedeTime } from './support/clock';
import { E2E_TODAY_REGION, type RegionalSettings } from './support/regional';

/**
 * e2e: register clinic + login (the registering user is ADMIN — the only role
 * that sees every Inicio block; `DASHBOARD_ROLES` in `dashboard.controller.ts`), seed the minimum data needed for every
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
 *     recorded against the plan in USD, `paidAt` today (`POST
 *     /treatment-plans/:id/payments`) — this is what the dashboard's
 *     "Ingresos del período" card now sums (PAY-T4: sales/`/sales` removed,
 *     incomes are sourced from payments, see `get-payments-totals.use-
 *     case.ts`);
 *   - an appointment TODAY, a few minutes ahead, `providerId` = the owner's
 *     own `userId` from `GET /staff` (`POST /appointments`).
 * ...then loads Inicio (I1) and asserts each block renders the seeded data:
 *   - «Hoy»: the appointment's sede-formatted time, «Agendada», the patient
 *     link and «Por confirmar» = 1;
 *   - «Pendientes»: «Bajo stock» = 1 linking to /inventory, presupuestos «Al día»;
 *   - «Resultados del período» → «Cobrado, en USD»: the abono and «1 abono»;
 *   - «Cartera por antigüedad»: the plan is fully paid → «Nadie debe.».
 *
 * OFFLINE by design: the abono's currency (USD) equals the dashboard's
 * default query currency (USD), so `GetPaymentsTotalsUseCase` ->
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
// (see `page.evaluate` below) with the same options as the app's
// `moneyWithCode` (DX-354b): the sede's locale, the ISO code and two FIXED
// fraction digits (DX-098). Relying on ICU's default for USD breaks on recent
// builds, which give USD 0 decimals.

/**
 * La sede y el navegador van en `SEDE_TODAY_TZ` (support/clock.ts): la cita de
 * «Hoy» se agenda con el reloj real a 3 minutos vista, y en la zona de la
 * suite, desde las 23:57 de la sede caía en mañana y no salía en «Hoy». Esa
 * zona deja siempre al menos 3 h hasta la medianoche.
 */
const ZONE = SEDE_TODAY_TZ;
test.use({ timezoneId: ZONE });

// Same formatter as `dashboard-view.tsx`'s `formatTime`, in the browser's
// (the sede's) timezone — not Node's (see support/clock.ts).
const formatTime = (at: Date) => sedeTime(at, ZONE);

test('Inicio (ADMIN): hoy, pendientes, resultados del período y cartera con los datos sembrados', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName,
    fullName,
    email,
    password,
    location: E2E_TODAY_REGION,
  });
  await disableBusinessHours(page, origin);

  const accessToken = await accessTokenOf(page);
  expect(accessToken).toBeTruthy();

  const seedHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };

  // --- Seed a patient ---
  const patientResponse = await page.request.post(`${API_URL}/patients`, {
    headers: seedHeaders,
    data: {
      firstName: patientFirstName,
      lastName: patientLastName,
      docType: 'NATIONAL_ID',
      docNumber: patientDocNumber,
      sex: 'F',
    },
  });
  expect(patientResponse.ok(), `Seeding the patient failed: ${await patientResponse.text()}`).toBeTruthy();
  const patient = (await patientResponse.json()) as { id: string };

  // --- Seed an inventory item with minStock > 0 and NO movement recorded,
  // so it resolves to `stock: 0` (below its minimum) -> low stock. ---
  const inventoryResponse = await page.request.post(`${API_URL}/inventory/items`, {
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
  const catalogResponse = await page.request.post(`${API_URL}/catalog/items`, {
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
    `${API_URL}/patients/${patient.id}/treatment-plans`,
    {
      headers: seedHeaders,
      data: {},
    },
  );
  expect(planResponse.ok(), `Seeding the treatment plan failed: ${await planResponse.text()}`).toBeTruthy();
  const plan = (await planResponse.json()) as { id: string };

  const itemResponse = await page.request.post(
    `${API_URL}/treatment-plans/${plan.id}/items`,
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
    `${API_URL}/treatment-plans/${plan.id}/items/${planItem.id}`,
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
    `${API_URL}/treatment-plans/${plan.id}/payments`,
    {
      headers: seedHeaders,
      data: {
        amount: paymentAmount,
        // USD so it equals the dashboard's default query currency — keeps the
        // conversion a `from === to` passthrough (offline, no exchange call).
        currency: 'USD',
        // Ahora mismo: desde DX-097 la API corta los días en la zona de la
        // sede, así que un abono de cualquier hora de hoy cae en «hoy».
        paidAt: new Date().toISOString(),
      },
    },
  );
  expect(paymentResponse.ok(), `Seeding the payment failed: ${await paymentResponse.text()}`).toBeTruthy();

  // --- Resolve the owner's own userId (provider for the appointment) ---
  const staffResponse = await page.request.get(`${API_URL}/staff`, {
    headers: seedHeaders,
  });
  expect(staffResponse.ok(), `Listing staff failed: ${await staffResponse.text()}`).toBeTruthy();
  const staff = (await staffResponse.json()) as { userId: string; fullName: string; role: string }[];
  const owner = staff.find((member) => member.role === 'OWNER') ?? staff[0];
  expect(owner, 'Expected the registered owner to appear in GET /staff').toBeTruthy();

  // --- Seed an appointment for TODAY, a few minutes ahead (I1: «Hoy» lists
  // the sede's civil day). The sede's zone (`ZONE`) is never within 3 h of
  // its midnight, so «a few minutes ahead» is still today at any hour. ---
  const appointmentStart = new Date(Date.now() + 3 * 60 * 1000);
  const appointmentEnd = new Date(appointmentStart.getTime() + 30 * 60 * 1000);
  const appointmentResponse = await page.request.post(`${API_URL}/appointments`, {
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

  // --- Load Inicio (default period = current month..today inclusive,
  // default currency USD -> covers today's abono; USD->USD passthrough) ---
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await expect(page.getByTestId('dashboard-scope')).toContainText(/Días en hora de \S/);

  // --- «Hoy»: the seeded appointment (time + status + patient link) ---
  const today = page.getByRole('region', { name: 'Hoy' });
  await expect(today.getByRole('list', { name: 'Citas de hoy' })).toBeVisible({ timeout: 10_000 });
  await expect(today.getByText(formatTime(appointmentStart), { exact: true })).toBeVisible();
  await expect(
    today.getByRole('link', { name: `${patientFirstName} ${patientLastName}` }),
  ).toHaveAttribute('href', `/patients/${patient.id}`);
  await expect(today.getByText('Agendada', { exact: true })).toBeVisible();
  await expect(today.getByTestId('today-toConfirm')).toHaveText('1');

  // --- «Pendientes»: the low-stock item counts, rows link where you act ---
  const pending = page.getByRole('region', { name: 'Pendientes', exact: true });
  await expect(pending.getByTestId('pending-low-stock-value')).toHaveText('1');
  await expect(pending.getByRole('link', { name: 'Bajo stock' })).toHaveAttribute('href', '/inventory');
  await expect(pending.getByTestId('pending-follow-up-value')).toHaveText('Al día');

  // --- «Resultados del período» → «Cobrado, en USD»: total + count ---
  // DX-354b: el importe sale con el formato de la sede y el código ISO
  // (`moneyWithCode`): se calcula con el Intl del navegador, el locale de la
  // sede de la suite, dos decimales fijos y dígitos latinos.
  const expectedIncome = await page.evaluate(
    ([amount, locale]) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'code',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        numberingSystem: 'latn',
      })
        .format(amount)
        .replace(/[\u200e\u200f\u061c]/g, ''),
    [paymentAmount, E2E_TODAY_REGION.locale] as const,
  );
  const incomes = page.getByTestId('dashboard-incomes');
  await expect(incomes.getByText('Cobrado, en USD', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(incomes.getByText(expectedIncome, { exact: true }).first()).toBeVisible();
  await expect(incomes.getByText('1 abono', { exact: true })).toBeVisible();
  await expect(page.getByTestId('dashboard-kpi-production')).toContainText('Producción');

  // --- «Cartera por antigüedad»: the plan is fully paid, nobody owes ---
  const aging = page.getByRole('region', { name: 'Cartera por antigüedad' });
  await expect(aging.getByText('Nadie debe.')).toBeVisible();
});

/**
 * DX-354b (W3), criterio 4: «Hoy» en «Todas las sedes» pinta la hora de cada
 * cita con el reloj de SU sede, y no con el de la pantalla ni con el del
 * navegador. La suite de arriba no lo distingue (el navegador y la sede están
 * en la misma zona); aquí el navegador está en `Asia/Tokyo` y la clínica tiene
 * dos sedes:
 * - la principal (la de la pantalla en «Todas las sedes»): la zona de la suite
 *   (`SEDE_TODAY_TZ`, con al menos 3 h hasta su medianoche), `es-VE`, 12 h;
 * - «Sede DE»: `Europe/Berlin`, `de-DE`, 24 h.
 * Una cita de hoy en cada una (a 3 y a 45 minutos vista, para que ambas caigan
 * en el día de la principal a cualquier hora); la hora esperada sale de
 * `regionalFormat` con la zona y el reloj de cada sede, sobre el instante que
 * devolvió la API. Capturas a 390 y 1440 px (claro y oscuro) en `E2E_QA_DIR`.
 */
test.describe('Inicio: «Todas las sedes» con el navegador en otra zona (DX-354b)', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  const MAIN: RegionalSettings = { ...E2E_TODAY_REGION, hourCycle: 'h12' };
  const DE: { name: string } & RegionalSettings = {
    name: 'Sede DE',
    country: 'DE',
    currency: 'EUR',
    timeZone: 'Europe/Berlin',
    locale: 'de-DE',
    hourCycle: 'h23',
  };
  const QA_DIR = process.env.E2E_QA_DIR;
  const multiSuffix = `${suffix}m`.slice(0, 12);

  test('cada cita de Hoy dice la hora de su sede (12 h en la principal, 24 h en Berlín)', async ({ page }) => {
    test.setTimeout(240_000);
    const request = page.request;
    const multiEmail = `test.user.dashboard.multi.${multiSuffix}@example.com`;
    const session: ApiSession = await registerClinicViaApi(request, {
      subdomain: `test-clinic-dash-multi-${multiSuffix}`,
      clinicName: `Test Clinic Dashboard Multi ${multiSuffix}`,
      fullName,
      email: multiEmail,
      password,
      location: MAIN,
    });
    const deId = await createLocationViaApi(request, session, DE);
    const at = (locationId: string): ApiSession => ({
      ...session,
      headers: { ...session.headers, 'X-Location-Id': locationId },
    });

    // Una sede nueva nace con horario de atención: sin restricción en las dos, para que las citas a
    // «ahora + N min» no dependan de la hora ni del día de la corrida (`disableBusinessHours`).
    const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
      id: string;
      name: string;
    }[];
    for (const location of locations) {
      const res = await request.put(`${API_URL}/locations/schedule`, {
        headers: { ...session.headers, 'X-Location-Id': location.id },
        data: { ranges: [] },
      });
      expect(res.ok(), `Desactivar el horario de ${location.name} falló: ${await res.text()}`).toBeTruthy();
    }
    const mainId = locations.find((l) => l.id !== deId)!.id;

    const staffResponse = await request.get(`${API_URL}/staff`, { headers: session.headers });
    expect(staffResponse.ok(), `Listing staff failed: ${await staffResponse.text()}`).toBeTruthy();
    const staff = (await staffResponse.json()) as { userId: string; role: string }[];
    const owner = staff.find((member) => member.role === 'OWNER') ?? staff[0];

    const sedes = [
      { key: 'main', id: mainId, region: MAIN, minutes: 3, firstName: 'Carolina' },
      { key: 'de', id: deId, region: DE, minutes: 45, firstName: 'Jonas' },
    ] as const;
    const booked: { lastName: string; start: string; region: RegionalSettings }[] = [];
    for (const sede of sedes) {
      const lastName = `Multi${sede.key}${multiSuffix}`.slice(0, 30);
      const patient = await apiPost<{ id: string }>(request, at(sede.id), '/patients', {
        firstName: sede.firstName,
        lastName,
        docType: 'PASSPORT',
        docNumber: `DM${sede.key}${multiSuffix}`.slice(0, 20),
        sex: 'F',
      });
      const start = new Date(Date.now() + sede.minutes * 60 * 1000);
      const appointment = await apiPost<{ id: string; start: string; locationId?: string }>(
        request,
        at(sede.id),
        '/appointments',
        {
          patientId: patient.id,
          providerId: owner.userId,
          start: start.toISOString(),
          end: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
          reason: `Control ${sede.key} ${multiSuffix}`,
        },
      );
      booked.push({ lastName, start: appointment.start, region: sede.region });
    }

    await loginAs(page, session.origin, multiEmail, password);
    // Sin sede activa: la pantalla es la principal y cada fila trae la suya.
    await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
    await page.goto(`${session.origin}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
    await expect(page.getByTestId('dashboard-scope')).toContainText('Todas las sedes');

    const today = page.getByRole('region', { name: 'Hoy' });
    await expect(today.getByRole('list', { name: 'Citas de hoy' })).toBeVisible({ timeout: 15_000 });
    const times: string[] = [];
    for (const appointment of booked) {
      const expected = regionalFormat({ locale: appointment.region.locale, hourCycle: appointment.region.hourCycle }).time(
        new Date(appointment.start),
        appointment.region.timeZone,
      );
      times.push(expected);
      const row = today.getByRole('listitem').filter({ hasText: appointment.lastName });
      await expect(row.locator('time')).toHaveText(expected, { timeout: 15_000 });
    }
    // Cada reloj es el de su sede: 12 h con «a. m./p. m.» en la principal, 24 h «HH:MM» en Berlín.
    expect(times[0]).toMatch(/^\d{1,2}:\d{2} [ap]\. m\.$/);
    expect(times[1]).toMatch(/^\d{2}:\d{2}$/);
    // Ni el reloj del navegador (Tokio) ni el aviso de formato.
    const tokyo = regionalFormat({ locale: MAIN.locale, hourCycle: MAIN.hourCycle }).time(
      new Date(booked[0].start),
      'Asia/Tokyo',
    );
    await expect(today.getByText(tokyo, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/No se pudo saber el formato regional/)).toHaveCount(0);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
      if (!QA_DIR) continue;
      mkdirSync(QA_DIR, { recursive: true });
      await page.mouse.move(0, 0);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.screenshot({ path: `${QA_DIR}/inicio-hoy-todas-las-sedes-${viewport.width}-${scheme}.png` });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });
});

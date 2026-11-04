import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { dataList, dataListRows } from './support/data-list';
import { expectNoHorizontalScroll } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e DX-354b (W2, DX-517-bis «Caja… locale `es` fijo»): la caja, el registro de
 * caja y los gastos pintan cada FILA con la hora, la fecha y el importe de SU
 * sede, no con los de la pantalla ni con los del navegador.
 *
 * Una clínica nueva por corrida con tres sedes creadas por la API:
 * - CCS (la principal, la de la pantalla en «Todas las sedes»):
 *   `America/Caracas` / `es-VE` / USD / 12 h;
 * - US: `America/New_York` / `en-US` / USD / 12 h;
 * - DE: `Europe/Berlin` / `de-DE` / EUR / 24 h («1.234,50 EUR»).
 * El navegador está en `Asia/Tokyo` (`test.use`): nada coincide por casualidad.
 * Los valores esperados se calculan con `regionalFormat` a partir de lo que
 * devuelve la propia API (nunca cadenas a ojo), salvo los literales de los
 * importes, que fijan el formato de cada sede.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `caja-${suffix}`;
const password = 'Password123!';
const adminEmail = `admin.caja.${suffix}@example.com`;

type Sede = { name: string } & RegionalSettings;
type Key = 'us' | 'de';

const MAIN: Partial<RegionalSettings> = {
  country: 'VE',
  currency: 'USD',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
};
const SEDES: Record<Key, Sede> = {
  us: { name: 'Sede US', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' },
  de: { name: 'Sede DE', country: 'DE', currency: 'EUR', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' },
};
const KEYS: readonly Key[] = ['us', 'de'];
/** El importe de todos los datos de la prueba, en la moneda de cada sede. */
const AMOUNT = 1234.5;
/** Cómo se ve ese importe en cada sede (código ISO, formato de su locale). */
const AMOUNT_TEXT: Record<Key, string> = { us: 'USD 1,234.50', de: '1.234,50 EUR' };

test.use({ timezoneId: 'Asia/Tokyo' });
test.describe.configure({ mode: 'serial' });

interface OpenedSession {
  id: string;
  openedAt: string;
  location: { id: string; name: string };
}
interface Created {
  id: string;
  createdAt: string;
}

let session: ApiSession;
let origin = '';
const ids = {} as Record<Key, string>;
const sessions = {} as Record<Key, OpenedSession>;
const patientNames = {} as Record<Key, string>;
const lastName = `Caja${suffix}`.slice(0, 30);
/** El día del abono en cada sede: AYER en Caracas (así el reloj fijo del navegador y el abono quedan en el pasado). */
const PAID_DAY = sedeDayFromToday(-1);
const supplier = `Proveedor US ${suffix}`;
let expense: Created & { invoiceDate: string };

function at(key: Key): ApiSession {
  return { ...session, headers: { ...session.headers, 'X-Location-Id': ids[key] } };
}

const fmtOf = (s: Sede) => regionalFormat({ locale: s.locale, hourCycle: s.hourCycle });
const dateTime = (s: Sede, iso: string) => fmtOf(s).dateTime(new Date(iso), s.timeZone);
const civilDate = (s: Sede, day: string) => fmtOf(s).civilDate(day);
/** `Intl` separa con espacios duros: se compara con espacios normales. */
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

async function expectContains(locator: Locator, expected: string): Promise<void> {
  await expect.poll(async () => norm((await locator.textContent()) ?? ''), { timeout: 15_000 }).toContain(norm(expected));
}
async function expectNotContains(locator: Locator, unexpected: string): Promise<void> {
  expect(norm((await locator.textContent()) ?? '')).not.toContain(norm(unexpected));
}

/** Sin scroll horizontal a 1440 y a 390 px. */
async function noOverflow(page: Page): Promise<void> {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
  }
}

async function noRegionalNotice(page: Page): Promise<void> {
  await expect(page.getByText(/No se pudo saber el formato regional/)).toHaveCount(0);
}

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000);
  const request: APIRequestContext = await playwright.request.newContext();
  try {
    session = await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Caja ${suffix}`,
      fullName: 'Ana Titular',
      email: adminEmail,
      password,
      location: MAIN,
    });
    origin = session.origin;
    ids.us = await createLocationViaApi(request, session, SEDES.us);
    ids.de = await createLocationViaApi(request, session, SEDES.de);

    for (const key of KEYS) {
      const sede = SEDES[key];
      // Un abono en efectivo en la sede, cobrado a mediodía de SU zona el día PAID_DAY.
      const patient = await apiPost<{ id: string; fullName?: string }>(request, session, '/patients', {
        firstName: `Paciente${key.toUpperCase()}`,
        lastName,
        docType: 'PASSPORT',
        docNumber: `CJ${key}${suffix}`.slice(0, 20),
        sex: 'F',
      });
      patientNames[key] = `Paciente${key.toUpperCase()} ${lastName}`;
      const plan = await apiPost<{ id: string }>(request, at(key), `/patients/${patient.id}/treatment-plans`, {
        currency: sede.currency,
      });
      await apiPost(request, at(key), `/treatment-plans/${plan.id}/payments`, {
        amount: AMOUNT,
        currency: sede.currency,
        paidAt: atSede(PAID_DAY, '12:00', sede.timeZone).toISOString(),
        method: 'CASH',
      });
    }

    // Una caja abierta por el administrador en cada sede, con el fondo de 1.234,50 en su moneda.
    for (const key of KEYS) {
      sessions[key] = await apiPost<OpenedSession>(request, session, '/cash-sessions/open', {
        locationId: ids[key],
        floats: [{ currency: SEDES[key].currency, amount: AMOUNT }],
      });
    }

    // Un gasto de la sede US, con fecha de factura de HOY en su zona.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: SEDES.us.timeZone }).format(new Date());
    const created = await apiPost<Created>(
      request,
      { ...at('us'), headers: { ...at('us').headers, 'Idempotency-Key': randomUUID() } },
      '/expenses',
      {
        locationId: ids.us,
        category: 'Insumos clínicos',
        supplier,
        amount: AMOUNT,
        currency: 'USD',
        invoiceDate: today,
      },
    );
    expense = { ...created, invoiceDate: today };
  } finally {
    await request.dispose();
  }
});

test('«Todas las sedes»: los turnos dicen la hora de apertura y el fondo de la sede de cada caja', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja?tab=turnos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Caja' })).toBeVisible({ timeout: 15_000 });
  const list = dataList(page, 'Turnos de caja');
  await expect(list).toBeVisible({ timeout: 15_000 });

  for (const key of KEYS) {
    const sede = SEDES[key];
    const row = dataListRows(list).filter({ hasText: sede.name });
    await expect(row).toHaveCount(1);
    // La hora de apertura es la de SU sede (24 h en Berlín, 12 h en Nueva York), no la de Tokio ni la de la otra sede.
    await expectContains(row, dateTime(sede, sessions[key].openedAt));
    await expectContains(row, AMOUNT_TEXT[key]);
    const other: Key = key === 'us' ? 'de' : 'us';
    await expectNotContains(row, dateTime(SEDES[other], sessions[key].openedAt));
    await expectNotContains(row, AMOUNT_TEXT[other]);
  }
  // La hora de Berlín va en 24 h y la de Nueva York en 12 h: con el mismo instante, no se confunden.
  const de = dateTime(SEDES.de, sessions.de.openedAt);
  const us = dateTime(SEDES.us, sessions.us.openedAt);
  expect(de).not.toBe(us);
  await noRegionalNotice(page);
  await noOverflow(page);
});

test('«Todas las sedes»: el registro de caja dice la fecha y el importe de la sede de cada abono (1.234,50 EUR en Berlín)', async ({ page }) => {
  // El reloj del navegador: las 22:30 de PAID_DAY en Caracas, así «Hoy» es PAID_DAY.
  await page.clock.setFixedTime(atSede(PAID_DAY, '22:30'));
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja`);
  await expect(page.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  const table = dataList(page, 'Abonos del período');
  await expect(table).toBeVisible({ timeout: 15_000 });

  for (const key of KEYS) {
    const sede = SEDES[key];
    const row = dataListRows(table).filter({ hasText: patientNames[key] });
    await expect(row).toHaveCount(1);
    await expectContains(row, AMOUNT_TEXT[key]);
    await expectContains(row, civilDate(sede, PAID_DAY));
    await expectContains(row, sede.name);
    const other: Key = key === 'us' ? 'de' : 'us';
    await expectNotContains(row, AMOUNT_TEXT[other]);
    await expectNotContains(row, civilDate(SEDES[other], PAID_DAY));
  }
  // Los dos formatos de fecha son distintos entre sí (03.11.2026 frente a 11/03/2026).
  expect(civilDate(SEDES.de, PAID_DAY)).not.toBe(civilDate(SEDES.us, PAID_DAY));
  await noRegionalNotice(page);
  await noOverflow(page);
});

test('el gasto de la sede US se ve con el formato de su sede: «USD 1,234.50», su fecha y su hora de registro', async ({ page }) => {
  // «Hoy» de la pantalla es el día del gasto: mediodía de Nueva York (solo si ya pasó: nunca un reloj en el futuro).
  const noonUs = atSede(expense.invoiceDate, '12:00', SEDES.us.timeZone);
  if (noonUs.getTime() <= Date.now()) await page.clock.setFixedTime(noonUs);
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/caja/gastos`);
  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Buscar por proveedor o descripción').fill(supplier);
  const listing = page.getByRole('table', { name: /^Gastos del periodo/ });
  await expect(listing).toContainText(supplier, { timeout: 15_000 });
  await listing.getByRole('button', { name: /^Insumos clínicos/ }).click();

  const detail = page.getByRole('dialog', { name: `Insumos clínicos · ${supplier}` });
  await expect(detail.getByRole('heading', { name: 'Pagos' })).toBeVisible({ timeout: 15_000 });
  await expectContains(detail, AMOUNT_TEXT.us);
  await expectContains(detail, civilDate(SEDES.us, expense.invoiceDate));
  await expectContains(detail, dateTime(SEDES.us, expense.createdAt));
  // Ni el formato de la principal (Caracas) ni el de Berlín.
  await expectNotContains(detail, `EUR ${AMOUNT}`);
  await expectNotContains(detail, dateTime(SEDES.de, expense.createdAt));
  await expectNotContains(detail, dateTime(MAIN as Sede, expense.createdAt));
  await noRegionalNotice(page);
});

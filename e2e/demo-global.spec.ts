import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { fillDate } from './support/dates';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import {
  DEMO_ADMIN_EMAIL,
  DEMO_LOCATION_REGIONS,
  DEMO_PASSWORD,
  DEMO_SUBDOMAIN,
  demoAdminSession,
  listLocations,
  type DemoLocation,
} from './support/demo';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { activeSedeSelect } from './support/nav';
import { cashCollected, choosePeriod, collectedOf, comparisonRow, nonZero } from './support/comparison';
import { API_URL, tenantOrigin } from './support/urls';
import { formatCivilDate } from '../src/lib/format/date';
import { countryName } from '../src/lib/locations/countries';
import { zoneCityName } from '../src/lib/format/zone';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';
import { addCivilDays, wallDay, wallInstant } from '../src/lib/time/wall-clock';
import type { ApiSession } from './support/api';

/**
 * e2e DX-335 (V1): la demo global, de SOLO LECTURA.
 *
 * La clínica DEMO trae cuatro sedes con su propia región (Sede principal y
 * Sede Norte en Caracas, Sede São Paulo en BRL, Sede Londres en GBP). El spec
 * recorre la demo tal como la deja `seed:demo`, con la ADMIN, a 1440 y 390 px:
 *
 *  1. El selector de sede lista las cuatro sedes sembradas.
 *  2. Cada sede, elegida como sede activa: la agenda (Día) dice «hoy» en la
 *     zona de la sede, una cita suya sale a la hora de SU zona y el importe
 *     de un plan de la sede sale con su moneda y el formato de la sede.
 *  3. Ajustes › Calendario de Sede Londres lista sus festivos de ejemplo.
 *  4. Ajustes › Tasa de cambio lista VES, BRL y GBP con la tasa de hoy.
 *  5. La cobertura pendiente de «Ricardo Salcedo Parra» empieza después de hoy.
 *  6. El móvil de «Emily Clarke» (línea fija de Londres) no sirve para WhatsApp.
 *
 *  7. Ajustes › Sedes, «Comparar sedes» y el recibo de un abono de cada sede
 *     (su número de la serie de la sede y su moneda).
 *
 * Nada se crea ni se cambia (abrir un recibo solo deja su evento de auditoría): no hay limpieza que hacer. Cada pantalla, sin
 * scroll horizontal y con axe sin violaciones serias ni críticas, en claro y
 * oscuro. Capturas a 1440 y 390 px en E2E_QA_DIR si está definido.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
/** Cuántos días por delante se busca la próxima cita de una sede (una semana cerrada y un festivo caben de sobra). */
const LOOKAHEAD_DAYS = 21;

const REGIONS = Object.entries(DEMO_LOCATION_REGIONS);

/** Cómo se nombran las capturas de cada sede; `plan` es null donde el brief no pide la captura del plan. */
const SEDE_SHOTS: Readonly<Record<string, { slug: string; plan: string | null }>> = {
  'Sede principal': { slug: 'principal', plan: null },
  'Sede Norte': { slug: 'norte', plan: null },
  'Sede São Paulo': { slug: 'saopaulo', plan: 'plan-saopaulo-brl' },
  'Sede Londres': { slug: 'londres', plan: 'plan-londres-gbp' },
};

/**
 * Lo que se pide de cada pantalla: sin scroll horizontal y, en claro y en
 * oscuro, sin violaciones de axe serias ni críticas. Después, la captura.
 */
async function checkScreen(page: Page, name: string, width: number, captureAs: string | null = name): Promise<void> {
  await expectNoHorizontalScroll(page);
  const found = await axeInBothThemes(page, page.locator('main'));
  for (const scheme of ['light', 'dark'] as const) {
    const blocking = found[scheme].filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking, `axe (${scheme}) en ${name} a ${width} px`).toEqual([]);
  }
  if (captureAs) await shot(page, captureAs, width);
}

/** Deja `target` al comienzo de la zona visible, para que la captura enseñe lo que la prueba comprobó. */
async function bringToTop(page: Page, target: Locator, block: 'start' | 'center' = 'start'): Promise<void> {
  await target.evaluate((el, where) => el.scrollIntoView({ block: where }), block);
  // Un respiro bajo el borde superior (la cabecera pegada no tapa el título).
  if (block === 'start') await page.evaluate(() => document.querySelector('main')?.scrollBy(0, -24));
}

/** Elige la sede activa en el selector global; cambiar de sede recarga la vista. */
async function chooseSede(page: Page, sedeName: string): Promise<void> {
  const switcher = activeSedeSelect(page);
  await expect(switcher).toBeVisible({ timeout: 15_000 });
  await switcher.selectOption({ label: sedeName });
  await page.waitForLoadState('load');
  await expect(switcher.locator('option:checked')).toHaveText(sedeName, { timeout: 15_000 });
}

interface PlanFigures {
  patientId: string;
  currency: string;
  total: number;
}
interface DayAppointment {
  id: string;
  day: string;
  start: Date;
  end: Date;
}

async function apiGet<T>(request: APIRequestContext, session: ApiSession, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: session.headers });
  expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/**
 * La primera cita viva (no cancelada) de la sede desde el comienzo de «hoy»
 * en su zona: de hoy, o del próximo día abierto. La API devuelve las citas
 * ordenadas por inicio.
 */
async function nextAppointment(
  request: APIRequestContext,
  session: ApiSession,
  location: DemoLocation,
  timeZone: string,
): Promise<DayAppointment & { patientId: string }> {
  const today = wallDay(new Date(), timeZone);
  const from = wallInstant(today, 0, timeZone);
  const to = wallInstant(addCivilDays(today, LOOKAHEAD_DAYS), 0, timeZone);
  const list = await apiGet<
    { id: string; patientId: string; start: string; end: string; status: string }[]
  >(request, session, `/appointments?from=${from.toISOString()}&to=${to.toISOString()}&locationId=${location.id}`);
  const next = list
    .filter((a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  expect(next, `${location.name} no tiene citas en los próximos ${LOOKAHEAD_DAYS} días`).toBeDefined();
  const start = new Date(next.start);
  return { id: next.id, patientId: next.patientId, day: wallDay(start, timeZone), start, end: new Date(next.end) };
}

/**
 * Un plan de la sede con su moneda (la de la sede) y su total: el de un
 * paciente con citas allí que tiene UN solo plan en esa moneda, para que la
 * pestaña muestre justo ese.
 */
async function sedePlan(
  request: APIRequestContext,
  session: ApiSession,
  location: DemoLocation,
  currency: string,
  timeZone: string,
): Promise<PlanFigures> {
  const today = wallDay(new Date(), timeZone);
  const from = wallInstant(addCivilDays(today, -30), 0, timeZone);
  const to = wallInstant(addCivilDays(today, LOOKAHEAD_DAYS), 0, timeZone);
  const appointments = await apiGet<{ patientId: string }[]>(
    request,
    session,
    `/appointments?from=${from.toISOString()}&to=${to.toISOString()}&locationId=${location.id}`,
  );
  for (const patientId of new Set(appointments.map((a) => a.patientId))) {
    const plans = await apiGet<{ id: string; currency: string }[]>(
      request,
      session,
      `/patients/${patientId}/treatment-plans`,
    );
    if (plans.length !== 1 || plans[0].currency !== currency) continue;
    const detail = await apiGet<{ total?: number }>(request, session, `/treatment-plans/${plans[0].id}`);
    if (detail.total && detail.total > 0) return { patientId, currency, total: detail.total };
  }
  throw new Error(`${location.name} no tiene un paciente con un único plan en ${currency}`);
}

/** Cuántos días atrás se busca un abono de la sede (la API no pasa de 366 días por consulta). */
const PAYMENT_LOOKBACK_DAYS = 120;

/**
 * Un abono vivo de la sede (la caja filtrada por `X-Location-Id`, que no
 * lista los anulados) y el número de su recibo, que se lee del propio recibo.
 */
async function sedePayment(
  request: APIRequestContext,
  session: ApiSession,
  location: DemoLocation,
  timeZone: string,
): Promise<{ id: string; currency: string; receiptNumber: string }> {
  const to = wallDay(new Date(), timeZone);
  const from = addCivilDays(to, -PAYMENT_LOOKBACK_DAYS);
  const res = await request.get(`${API_URL}/payments?from=${from}&to=${to}&pageSize=100`, {
    headers: { ...session.headers, 'X-Location-Id': location.id },
  });
  expect(res.ok(), `GET /payments de ${location.name} falló: ${await res.text()}`).toBeTruthy();
  const { items } = (await res.json()) as {
    items: { id: string; currency: string; location: { id: string } }[];
  };
  const payment = items.find((p) => p.location.id === location.id);
  expect(payment, `${location.name} no tiene abonos en los últimos ${PAYMENT_LOOKBACK_DAYS} días`).toBeDefined();
  const receipt = await apiGet<{ reference: string }>(request, session, `/payments/${payment!.id}/receipt`);
  return { id: payment!.id, currency: payment!.currency, receiptNumber: receipt.reference };
}

async function findPatientId(
  request: APIRequestContext,
  session: ApiSession,
  query: string,
  fullName: string,
): Promise<string> {
  const { items } = await apiGet<{ items: { id: string; firstName: string; lastName: string }[] }>(
    request,
    session,
    `/patients?query=${encodeURIComponent(query)}`,
  );
  const found = items.find((p) => `${p.firstName} ${p.lastName}` === fullName);
  expect(found, `la demo no trae a ${fullName}`).toBeDefined();
  return found!.id;
}

let session: ApiSession;
let locations: DemoLocation[];

test.beforeAll(async ({ request }) => {
  session = await demoAdminSession(request);
  locations = await listLocations(request, session);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

test('the location picker lists the four seeded locations', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/patients`);
    const switcher = activeSedeSelect(page);
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status', { name: /cargando/i })).toHaveCount(0);
    for (const name of Object.keys(DEMO_LOCATION_REGIONS)) {
      await expect(switcher.locator('option', { hasText: name }), name).toHaveCount(1);
    }
    await checkScreen(page, 'sede-picker', viewport.width);
  }
});

for (const [sedeName, region] of REGIONS) {
  test(`each location shows the agenda in its own zone and its money in its own format: ${sedeName}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const location = locations.find((l) => l.name === sedeName);
    expect(location, `la demo no trae la sede ${sedeName}`).toBeDefined();
    const fmt = regionalFormat(region);
    const next = await nextAppointment(request, session, location!, region.timeZone);
    const plan = await sedePlan(request, session, location!, region.currency, region.timeZone);
    const key = SEDE_SHOTS[sedeName];
    const payment = await sedePayment(request, session, location!, region.timeZone);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);

      // Agenda › Día: «hoy» es el de la zona de la sede (contado antes de abrir la agenda
      // o al mirarla: una medianoche de la sede entre los dos no hace fallar).
      const dayBefore = wallDay(new Date(), region.timeZone);
      await page.goto(`${origin}/agenda`);
      await chooseSede(page, sedeName);
      await page.getByRole('button', { name: 'Día', exact: true }).click();
      // En el teléfono el Día abre en «Lista»; las tarjetas son de las columnas.
      await page.getByRole('button', { name: 'Columnas', exact: true }).click();
      // Sin comas: el rótulo es el del idioma de la interfaz, con o sin coma tras el día de la semana.
      const periodOf = (day: string) => fmt.civilLongDate(day, { year: false }).replace(/,/g, '');
      let today = dayBefore;
      await expect
        .poll(
          async () => {
            const shown = ((await page.getByTestId('agenda-period').textContent()) ?? '').replace(/,/g, '');
            const day = [dayBefore, wallDay(new Date(), region.timeZone)].find((d) => periodOf(d) === shown);
            if (day) today = day;
            return day ? 'hoy' : shown;
          },
          { timeout: 15_000 },
        )
        .toBe('hoy');

      // La cita, en su día de la sede y a la hora de SU zona.
      if (next.day !== today) await fillDate(page, 'Fecha', next.day);
      const range = `${fmt.time(next.start, region.timeZone)}–${fmt.time(next.end, region.timeZone)}`;
      const card = page.locator(`[data-testid="day-column-appointment"][data-appointment-id="${next.id}"]`);
      await expect(card).toContainText(range, { timeout: 15_000 });
      // En el teléfono las columnas son pestañas por profesional: la lista enseña la cita sin cambiar de pestaña.
      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'Lista', exact: true }).click();
        await expect(page.getByText(fmt.time(next.start, region.timeZone)).locator('visible=true').first()).toBeVisible();
      } else {
        await bringToTop(page, card, 'center');
      }
      await checkScreen(page, `agenda-${key.slug}`, viewport.width);

      // El importe de un plan de la sede: su moneda, con el formato de la sede.
      await page.goto(`${origin}/patients/${plan.patientId}?tab=treatment-plans`);
      const panel = page.locator('#tabpanel-treatment-plans');
      await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
      const total = panel
        .locator('dl > div')
        .filter({ has: page.getByRole('term').getByText('Total', { exact: true }) })
        .getByRole('definition');
      await expect(total).toHaveText(moneyWithCode(plan.total, plan.currency, fmt).replace(/ /g, ' '), {
        timeout: 15_000,
      });
      await bringToTop(page, total, 'center');
      await checkScreen(page, `plan-${key.slug}`, viewport.width, key.plan);

      // El recibo de un abono de la sede: su número de la serie de la sede y su moneda.
      await page.goto(`${origin}/print/payments/${payment.id}/receipt`);
      const doc = page.getByTestId('receipt-document');
      await expect(doc).toContainText(`N.º ${payment.receiptNumber}`, { timeout: 15_000 });
      await expect(doc).toContainText(payment.currency);
      await checkScreen(page, `receipt-${key.slug}`, viewport.width);
    }
  });
}

test('the location settings list each location with its country, currency and zone', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/settings/sedes`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sedes' })).toBeVisible({ timeout: 15_000 });
    for (const [name, region] of REGIONS) {
      const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `Abrir ${name}`, exact: true }) });
      await expect(row, name).toHaveCount(1, { timeout: 15_000 });
      const detail = (label: string) =>
        row
          .locator('dl > div')
          .filter({ has: page.getByRole('term').getByText(label, { exact: true }) })
          .getByRole('definition');
      await expect(detail('País'), `país de ${name}`).toHaveText(countryName(region.country)!);
      await expect(detail('Moneda'), `moneda de ${name}`).toHaveText(region.currency);
      // La etiqueta de la zona lleva el desfase de hoy; la ciudad no cambia con el horario de verano.
      await expect(detail('Zona horaria'), `zona de ${name}`).toContainText(zoneCityName(region.timeZone));
    }
    await checkScreen(page, 'settings-sedes', viewport.width);
  }
});

test('the locations comparison lists the four locations with their currencies', async ({ page, request }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/reportes`);
    await expect(page.getByRole('tab', { name: 'Comparar sedes', selected: true })).toBeVisible({ timeout: 15_000 });
    // El mes anterior trae cobros en todas las sedes (el día 1 el mes en curso aún no), salvo
    // las horas en que una sede por delante de Caracas ya cambió de mes: lo que cobra cada
    // una sale de la respuesta que pinta la pantalla, contrastada con su caja (support/comparison.ts).
    const report = await choosePeriod(page, 'last_month', locations);
    const rows = page.getByTestId(viewport.width >= 768 ? 'comparison-row' : 'comparison-card').locator('visible=true');
    for (const [name, region] of REGIONS) {
      const row = rows.filter({ hasText: name });
      await expect(row, name).toHaveCount(1, { timeout: 15_000 });
      const location = locations.find((l) => l.name === name)!;
      const collected = nonZero(collectedOf(comparisonRow(report, name)));
      expect(collected, `«Cobrado» de ${name} frente a su caja`).toEqual(
        nonZero(await cashCollected(request, session, location.id, report)),
      );
      for (const code of Object.keys(collected)) {
        expect(region.currency === 'USD' ? ['USD', 'VES'] : [region.currency], name).toContain(code);
        await expect(row).toContainText(code, { timeout: 15_000 });
      }
    }
    // La captura arranca en la tabla (o en la primera tarjeta) para que se vean las filas de las sedes.
    await rows.first().evaluate((el) => (el.closest('table') ?? el).scrollIntoView({ block: 'start' }));
    await checkScreen(page, 'compare-sedes', viewport.width);
  }
});

test('the location calendar lists its sample holidays', async ({ page }) => {
  const london = locations.find((l) => l.name === 'Sede Londres');
  expect(london, 'la demo no trae Sede Londres').toBeDefined();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/settings/calendario?sede=${london!.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendario de la sede' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('calendar-sede')).toHaveText('Editando: Sede Londres');
    const holidays = page.getByRole('region', { name: 'Festivos' });
    for (const name of ['Navidad', 'San Esteban (Boxing Day)', 'Cierre por mantenimiento']) {
      await expect(holidays.getByText(name, { exact: true }).locator('visible=true').first(), name).toBeVisible({
        timeout: 15_000,
      });
    }
    await bringToTop(page, holidays);
    await checkScreen(page, 'calendar-londres', viewport.width);
  }
});

test('the exchange rate settings list today rate for VES, BRL and GBP', async ({ page, request }) => {
  // La demo siembra tasas MANUALES (hoy y ayer valen lo mismo, DX-449).
  const principal = DEMO_LOCATION_REGIONS['Sede principal'];
  const fmt = regionalFormat(principal);
  const today = wallDay(new Date(), principal.timeZone);
  const { source, rates } = await apiGet<{ source: string; rates: Record<string, number> }>(
    request,
    session,
    `/exchange/rates?date=${today}`,
  );
  expect(source).toBe('MANUAL');
  expect(rates).toEqual({ VES: 250, BRL: 5.4, GBP: 0.78 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/settings/tasa-de-cambio`);
    await chooseSede(page, 'Sede principal');
    // «Tasa de hoy» lista las monedas en que cobran las sedes distintas de USD (BRL y GBP)…
    const todayRates = page.getByTestId('exchange-rate-today');
    await expect(todayRates).toBeVisible({ timeout: 15_000 });
    await expect(todayRates).not.toContainText('Sin tasa hoy');
    for (const currency of ['BRL', 'GBP']) {
      const item = todayRates.locator('div').filter({ has: page.getByText(`${currency} por 1 USD`, { exact: true }) });
      await expect(item.last(), `tasa de hoy de ${currency}`).toContainText(
        fmt.number(rates[currency], { min: 0, max: 8 }),
      );
    }
    // …y la lista de tasas manuales trae las tres monedas con la fecha de hoy, VES incluida
    // (los abonos en bolívares la usan, aunque ninguna sede cobre en VES).
    const manual = page.getByRole('region', { name: 'Tasas manuales' });
    for (const [currency, rate] of Object.entries(rates)) {
      const row = manual
        .locator('tr, li')
        .filter({ visible: true, has: page.getByText(fmt.civilDate(today), { exact: true }) })
        .filter({ hasText: currency });
      await expect(row, `fila de hoy de ${currency}`).toHaveCount(1, { timeout: 15_000 });
      await expect(row).toContainText(fmt.number(rate, { min: 0, max: 8 }));
    }
    await bringToTop(page, manual);
    await checkScreen(page, 'exchange-rates', viewport.width);
  }
});

test('a pending coverage shows its start date after today', async ({ page, request }) => {
  const patientId = await findPatientId(request, session, 'Salcedo', 'Ricardo Salcedo Parra');
  const principal = DEMO_LOCATION_REGIONS['Sede principal'];
  const today = wallDay(new Date(), principal.timeZone);
  const coverages = await apiGet<{ status: string; validFrom: string | null }[]>(
    request,
    session,
    `/patients/${patientId}/coverages`,
  );
  const pending = coverages.find((c) => c.status === 'NOT_STARTED');
  expect(pending, 'Ricardo Salcedo Parra no tiene una cobertura pendiente').toBeDefined();
  const validFrom = pending!.validFrom!.slice(0, 10);
  expect(validFrom > today, `la cobertura empieza el ${validFrom}, hoy es ${today}`).toBe(true);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/patients/${patientId}`);
    const row = page.getByTestId('patient-coverage').getByTestId('coverage-row').filter({
      hasText: 'Pendiente de inicio',
    });
    await expect(row).toBeVisible({ timeout: 15_000 });
    // La ficha pinta la fecha con `formatCivilDate` (coverage-presentation.ts), no con el formato de la sede.
    await expect(row).toContainText(`Desde ${formatCivilDate(validFrom)}`);
    await bringToTop(page, row, 'center');
    await checkScreen(page, 'coverage-pending', viewport.width);
  }
});

test('a London patient with a fixed line cannot use WhatsApp', async ({ page, request }) => {
  const patientId = await findPatientId(request, session, 'Clarke', 'Emily Clarke');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/patients/${patientId}`);
    await expect(page.getByText('Móvil no válido', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^No sirve para WhatsApp/)).toBeVisible();
    await bringToTop(page, page.getByText('Móvil no válido', { exact: true }), 'center');
    await checkScreen(page, 'london-fixed-phone', viewport.width);
  }
});

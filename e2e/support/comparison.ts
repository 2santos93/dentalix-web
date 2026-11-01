import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { ApiSession } from './api';
import { API_URL } from './urls';
import { periodFor, type CivilPeriod, type PeriodPresetKey } from '../../src/lib/reports/period-presets';
import { pickSedeTimeZone, sedeToday } from '../../src/lib/locations/use-sede-time-zone';
import type { ClinicLocation } from '../../src/lib/locations/locations-api';
import type { ComparisonRow, LocationsComparison } from '../../src/lib/reports/reports-api';

/**
 * «Comparar sedes» frente a la demo a CUALQUIER hora (DX-335).
 *
 * La pantalla cuenta «hoy» —y con él «Mes anterior»— en UNA zona: la de la
 * sede activa o, sin ella, la de la principal (`pickSedeTimeZone`). La API
 * corta ese período en la zona de CADA sede, y la demo fecha la historia y los
 * abonos de cada sede en la suya: al cambiar de mes, Londres y São Paulo van
 * por delante de Caracas y durante unas horas su «mes anterior» no es el de la
 * pantalla. Por eso lo que se espera de cada fila no se fija a mano: sale de
 * la respuesta que pintó la pantalla, contrastada con la caja de cada sede.
 */

/** Una sede de `GET /locations` con lo que mira `pickSedeTimeZone`. */
export type ZonedLocation = Pick<ClinicLocation, 'id' | 'name' | 'isActive' | 'timeZone'>;

/** El período de un atajo tal como lo calcula la pantalla en el instante `now`. */
export function presetPeriod(
  key: Exclude<PeriodPresetKey, 'custom'>,
  locations: readonly ZonedLocation[],
  activeLocationId: string | null,
  now: Date = new Date(),
): CivilPeriod {
  const timeZone = pickSedeTimeZone(locations as readonly ClinicLocation[], activeLocationId);
  expect(timeZone, 'la sede de la pantalla no tiene zona').not.toBeNull();
  return periodFor(key, sedeToday(timeZone!, now))!;
}

/**
 * Elige el atajo en «Período» y devuelve la respuesta de la API que pinta la
 * pantalla. Su período debe ser el de la regla, contado justo antes de elegir
 * o al llegar la respuesta (una medianoche entre los dos no hace fallar).
 * Sin sede activa: la sesión del spec no elige ninguna.
 */
export async function choosePeriod(
  page: Page,
  key: Exclude<PeriodPresetKey, 'custom'>,
  locations: readonly ZonedLocation[],
): Promise<LocationsComparison> {
  const before = presetPeriod(key, locations, null);
  const response = page.waitForResponse((r) => {
    const url = new URL(r.url());
    if (!url.pathname.endsWith('/reports/locations-comparison') || r.request().method() !== 'GET') return false;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return [before, presetPeriod(key, locations, null)].some((p) => p.from === from && p.to === to);
  });
  await page.getByLabel('Período').selectOption(key);
  const res = await response;
  expect(res.ok(), `GET /reports/locations-comparison falló: ${res.status()}`).toBeTruthy();
  return (await res.json()) as LocationsComparison;
}

/** «Cobrado» de una fila: importe por moneda, en el orden de la API (también las monedas a 0). */
export function collectedOf(row: ComparisonRow): Map<string, number> {
  return new Map(
    (row.metrics.collected as { currency: string; value: number | null }[]).map((m) => [m.currency, m.value ?? 0]),
  );
}

/** La fila de una sede por su nombre: la demo trae una sola con cada nombre. */
export function comparisonRow(report: LocationsComparison, name: string): ComparisonRow {
  const rows = report.locations.filter((r) => r.name === name);
  expect(rows, `filas de ${name} en «Comparar sedes»`).toHaveLength(1);
  return rows[0];
}

/**
 * Lo que cobró una sede en el período según su caja (`GET /payments` con su
 * `X-Location-Id`: abonos no anulados, el período cortado en la zona de la
 * sede), solo las monedas con importe. Es la comprobación independiente de lo
 * que «Comparar sedes» dice de esa sede.
 */
export async function cashCollected(
  request: APIRequestContext,
  session: ApiSession,
  locationId: string,
  period: CivilPeriod,
): Promise<Map<string, number>> {
  const res = await request.get(`${API_URL}/payments?from=${period.from}&to=${period.to}&pageSize=1`, {
    headers: { ...session.headers, 'X-Location-Id': locationId },
  });
  expect(res.ok(), `GET /payments falló: ${await res.text()}`).toBeTruthy();
  const { summary } = (await res.json()) as { summary: { byCurrency: { currency: string; total: number }[] } };
  return new Map(summary.byCurrency.filter((c) => c.total !== 0).map((c) => [c.currency, c.total]));
}

/** Las monedas de un mapa con importe distinto de 0, ordenadas. */
export function nonZero(amounts: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries([...amounts].filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b)));
}

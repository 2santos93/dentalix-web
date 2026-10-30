import type { RegionalFormat } from '@/lib/format/regional-format';
import type { ComparisonRow, CurrencyMetric, KpiDefinition, KpiKey, LocationsComparison, Metric } from './reports-api';

/** Columna por la que se ordena: la sede o un indicador. */
export type SortKey = 'name' | KpiKey;
export type SortDirection = 'ascending' | 'descending';
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Tope de la ocupación (BE-042): la API ya lo aplica; la pantalla no lo pasa nunca. */
const MAX_OCCUPANCY = 100;

/** Un indicador como lista de valores (uno por moneda, o uno solo). */
export function metricValues(row: ComparisonRow, key: KpiKey): (Metric & Partial<CurrencyMetric>)[] {
  const value: Metric | CurrencyMetric[] = row.metrics[key];
  if (Array.isArray(value)) return value;
  if (key === 'occupancy' && value.value !== null && value.value > MAX_OCCUPANCY) {
    return [{ ...value, value: MAX_OCCUPANCY }];
  }
  return [value];
}

/**
 * Moneda con la que se ordena una columna de dinero: la primera del total
 * (las monedas no se mezclan, así que se compara la misma en todas las filas).
 */
export function sortCurrency(report: LocationsComparison, key: KpiKey): string | null {
  const value: Metric | CurrencyMetric[] = report.total.metrics[key];
  return Array.isArray(value) ? (value[0]?.currency ?? null) : null;
}

function valueFor(row: ComparisonRow, key: KpiKey, currency: string | null): number | null {
  const values = metricValues(row, key);
  if (currency === null) return values[0]?.value ?? null;
  return values.find((v) => v.currency === currency)?.value ?? null;
}

/**
 * Filas de sede ordenadas por la columna elegida; sin orden (`null`), en el de
 * la API (el de creación de las sedes). Los valores que no se pueden calcular
 * (null) van siempre al final; empates, por nombre. El «Total clínica» no
 * entra: va siempre abajo.
 */
export function sortRows(report: LocationsComparison, sort: SortState | null): ComparisonRow[] {
  if (sort === null) return report.locations;
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const byName = (a: ComparisonRow, b: ComparisonRow) => a.name.localeCompare(b.name, 'es');
  if (sort.key === 'name') {
    return [...report.locations].sort((a, b) => factor * byName(a, b));
  }
  const key = sort.key;
  const currency = sortCurrency(report, key);
  return [...report.locations].sort((a, b) => {
    const x = valueFor(a, key, currency);
    const y = valueFor(b, key, currency);
    if (x === null && y === null) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return x === y ? byName(a, b) : factor * (x - y);
  });
}

/** El siguiente orden al pulsar una cabecera: misma columna invierte; otra, de mayor a menor (el nombre, de A a Z). */
export function nextSort(current: SortState | null, key: SortKey): SortState {
  if (current?.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { key, direction: key === 'name' ? 'ascending' : 'descending' };
}

/**
 * Un valor según la unidad del indicador, con el formato de la sede (DX-378,
 * FE-078); «—» si no se puede calcular.
 */
export function formatMetric(
  unit: KpiDefinition['unit'],
  value: number | null,
  fmt: RegionalFormat,
  currency?: string,
): string {
  if (value === null) return '—';
  // Sin moneda, el importe sin símbolo (nunca una moneda de reserva).
  if (unit === 'MONEY') return currency ? fmt.money(value, currency) : fmt.number(value, { min: 2, max: 2 });
  if (unit === 'PERCENT') return fmt.percent(value, 2);
  return fmt.number(value, { max: 0 });
}

const CHANGE_SUFFIX = { POINTS: 'p.p.' } as const;

/**
 * La variación en la unidad del indicador (`changeUnit` de la API): «+20 %»
 * relativo, o «+2 p.p.» en los que ya son un % (no-show 8 % → 10 %). Signo
 * menos tipográfico.
 */
export function formatChange(change: number, unit: KpiDefinition['changeUnit'], fmt: RegionalFormat): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  const amount = Math.abs(change);
  if (unit === 'PERCENT') return `${sign}${fmt.percent(amount, 1)}`;
  return `${sign}${fmt.number(amount, { max: 1 })} ${CHANGE_SUFFIX.POINTS}`;
}

export const TREND_LABELS: Record<NonNullable<Metric['trend']>, string> = {
  BETTER: 'Mejora',
  WORSE: 'Empeora',
  EQUAL: 'Sin cambios',
};

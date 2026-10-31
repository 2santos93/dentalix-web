import type { KpiDefinition, Metric } from '@/lib/reports/reports-api';

/**
 * ¿La base del período comparado aguanta un porcentaje? (critique-ops §11:
 * «+1.150 %» de citas porque el mes anterior tuvo dos). Una sola regla para
 * Reportes e Inicio:
 *
 * - `new`: antes era 0 y ahora no. No hay % posible («nuevo»).
 * - `low`: la base es tan pequeña que el % es un artefacto («base baja»):
 *   - conteos (citas, pacientes nuevos) con menos de {@link LOW_BASE_MIN_EVENTS}
 *     en el período comparado: 2 → 25 citas no es «+1.150 %», es que antes no
 *     había agenda;
 *   - indicadores que se calculan por cita (no-show %, ocupación %, ticket
 *     medio) cuyo período comparado tuvo menos de {@link LOW_BASE_MIN_EVENTS}
 *     citas atendidas (`sample`): un 0 % o un ticket sobre dos citas no es una
 *     base;
 *   - cualquier % relativo por encima de {@link LOW_BASE_MAX_CHANGE} (el valor
 *     es más de 4 veces el anterior): en importes no sabemos qué es «poco» en
 *     cada moneda, pero multiplicar por cuatro de un período a otro es, en una
 *     clínica, un período anterior casi vacío, no una tendencia.
 * - `ok`: se enseña la variación como siempre.
 *
 * Las bajadas nunca pasan de −100 %, así que el tope solo mira subidas.
 */
export type DeltaBase = 'ok' | 'new' | 'low';

/** Menos de 5 sucesos (citas, pacientes) en el período comparado: base baja. */
export const LOW_BASE_MIN_EVENTS = 5;
/** Más de +300 % (×4): base baja. */
export const LOW_BASE_MAX_CHANGE = 300;

export function deltaBase(
  metric: Pick<Metric, 'value' | 'previous' | 'change'>,
  kpi: Pick<KpiDefinition, 'unit' | 'changeUnit'>,
  /** Sucesos del período comparado detrás de un indicador por cita (citas atendidas). */
  sample?: number | null,
): DeltaBase {
  const { value, previous, change } = metric;
  if (value === null || previous === null) return 'ok';
  if (sample !== undefined && sample !== null && sample < LOW_BASE_MIN_EVENTS) return 'low';
  if (kpi.changeUnit === 'POINTS') return 'ok';
  if (previous === 0) return value === 0 ? 'ok' : 'new';
  if (kpi.unit === 'COUNT' && Math.abs(previous) < LOW_BASE_MIN_EVENTS) return 'low';
  if (change !== null && change > LOW_BASE_MAX_CHANGE) return 'low';
  return 'ok';
}

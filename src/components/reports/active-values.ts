import { metricValues } from '@/lib/reports/comparison-table';
import type { ComparisonRow, KpiKey } from '@/lib/reports/reports-api';

/**
 * Los valores de un indicador sin las monedas en las que no hubo nada ni antes
 * ni ahora (un «USD 0,00 · Sin comparar» no dice nada). Si no queda ninguna, se
 * devuelve la primera: el «—» o el 0 del indicador es la respuesta honesta.
 * Compartido por «Comparar sedes» e Inicio.
 */
export function activeValues(row: ComparisonRow, key: KpiKey) {
  const values = metricValues(row, key);
  const quiet = (v: number | null) => v === null || v === 0;
  const active = values.filter((m) => !(m.currency && quiet(m.value) && quiet(m.previous)));
  return active.length > 0 ? active : values.slice(0, 1);
}

/** Citas atendidas del período comparado: la muestra de no-show % y ocupación % (ver `deltaBase`). */
export function previousSample(row: ComparisonRow): number | null {
  return row.metrics.completedAppointments.previous;
}

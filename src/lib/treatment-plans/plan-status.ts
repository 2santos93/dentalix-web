import { statusLabels } from '@/lib/status/tones';
import type { TreatmentPlanStatus } from './treatment-plans-api';

/** Etiquetas del estado de un plan; tono y etiqueta viven en `@/lib/status/tones` (usa `StatusBadge kind="treatmentPlan"`). */
export const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = statusLabels('treatmentPlan');

/**
 * Planes que no se cobran (DX-109, misma regla que la API): rechazados y
 * cancelados no admiten abonos ni planes de cuotas. Un plan completado sí.
 */
const NON_BILLABLE_STATUSES: readonly TreatmentPlanStatus[] = ['REJECTED', 'CANCELLED'];

export function isPlanBillable(status: TreatmentPlanStatus): boolean {
  return !NON_BILLABLE_STATUSES.includes(status);
}

/**
 * Planes cerrados (DX-109): cancelados, rechazados o completados. Sus ítems ya
 * no se añaden, cambian ni quitan, y su moneda no cambia.
 */
const CLOSED_STATUSES: readonly TreatmentPlanStatus[] = ['CANCELLED', 'REJECTED', 'COMPLETED'];

export function isPlanClosed(status: TreatmentPlanStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

import type { BadgeProps } from '@/components/ui/badge';
import type { TreatmentPlanStatus } from './treatment-plans-api';

/** Presentación del estado de un plan de tratamiento: el tab de planes y el estado de cuenta. */
export const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  DRAFT: 'Borrador',
  PRESENTED: 'Presentado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

// Variantes semánticas (nunca utilidades de color crudas): DRAFT es neutro
// (aún no pasó nada), PRESENTED warning (espera la respuesta del paciente,
// DX-040), ACCEPTED usa el primario (reconocido), COMPLETED success, REJECTED
// y CANCELLED danger — mismo criterio que `day-agenda.tsx`.
export const PLAN_STATUS_BADGE_VARIANT: Record<TreatmentPlanStatus, BadgeProps['variant']> = {
  DRAFT: 'muted',
  PRESENTED: 'warning',
  ACCEPTED: 'default',
  REJECTED: 'danger',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

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

import type { BadgeProps } from '@/components/ui/badge';
import type { TreatmentPlanStatus } from './treatment-plans-api';

/** Presentación del estado de un plan de tratamiento: el tab de planes y el estado de cuenta. */
export const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  DRAFT: 'Borrador',
  ACCEPTED: 'Aceptado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

// Variantes semánticas (nunca utilidades de color crudas): DRAFT es neutro
// (aún no pasó nada), ACCEPTED usa el primario (reconocido), COMPLETED success,
// CANCELLED danger — mismo criterio que `day-agenda.tsx`.
export const PLAN_STATUS_BADGE_VARIANT: Record<TreatmentPlanStatus, BadgeProps['variant']> = {
  DRAFT: 'muted',
  ACCEPTED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

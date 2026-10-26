import type { BadgeProps } from '@/components/ui/badge';
import type { TreatmentPlanItemStatus } from './treatment-plans-api';

/** Presentación del estado de un ítem del plan: el tab de planes y el cobrado por ítem del estado de cuenta (DX-051). */
export const ITEM_STATUS_LABELS: Record<TreatmentPlanItemStatus, string> = {
  PROPOSED: 'Propuesto',
  ACCEPTED: 'Aceptado',
  DONE: 'Realizado',
};

// Semantic Badge variants (never raw color utilities) — PROPOSED is neutral
// (nothing has happened yet), ACCEPTED maps to the brand/primary token
// (acknowledged), DONE to success; the plan-level map lives in
// `./plan-status` — same convention as `day-agenda.tsx`.
export const ITEM_STATUS_BADGE_VARIANT: Record<TreatmentPlanItemStatus, BadgeProps['variant']> = {
  PROPOSED: 'muted',
  ACCEPTED: 'default',
  DONE: 'success',
};

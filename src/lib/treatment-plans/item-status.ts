import { statusLabels } from '@/lib/status/tones';
import type { TreatmentPlanItemStatus } from './treatment-plans-api';

/** Etiquetas del estado de un ítem del plan; tono y etiqueta viven en `@/lib/status/tones` (`StatusBadge kind="treatmentPlanItem"`). */
export const ITEM_STATUS_LABELS: Record<TreatmentPlanItemStatus, string> = statusLabels('treatmentPlanItem');

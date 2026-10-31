import { statusLabels } from '@/lib/status/tones';
import type { InstallmentStatus } from './payment-plan-api';

/**
 * Etiquetas de los estados de cuota. Tono y etiqueta viven en UN sitio,
 * `@/lib/status/tones` (`StatusBadge kind="installment"`): el calendario del
 * plan de pagos y el estado de cuenta los pintan igual.
 */
export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = statusLabels('installment');

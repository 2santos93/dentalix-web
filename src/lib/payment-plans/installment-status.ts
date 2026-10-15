import type { BadgeProps } from '@/components/ui/badge';
import type { InstallmentStatus } from './payment-plan-api';

/**
 * Presentación de los estados de cuota, en UN sitio: el calendario del plan de
 * pagos y el estado de cuenta los pintan igual.
 */
export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
};

export const INSTALLMENT_STATUS_BADGE_VARIANT: Record<InstallmentStatus, BadgeProps['variant']> = {
  PAID: 'success',
  PARTIAL: 'warning',
  PENDING: 'muted',
  OVERDUE: 'danger',
};

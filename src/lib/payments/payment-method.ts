import type { BadgeProps } from '@/components/ui/badge';
import type { PaymentMethod } from './payments-api';

/**
 * Presentación de los métodos de pago, en UN sitio: el plan de tratamiento, el
 * recibo y la caja los pintan igual, y tenerlos copiados en cada vista era
 * esperar a que uno cambiara "Transferencia" por "Transf." y los otros no.
 */
export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethod[] = [
  'CASH',
  'CARD',
  'TRANSFER',
  'OTHER',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

// Tokens semánticos: efectivo es el camino feliz del "dinero en mano"
// (success); el resto son distinciones neutras, no estados.
export const PAYMENT_METHOD_BADGE_VARIANT: Record<PaymentMethod, BadgeProps['variant']> = {
  CASH: 'success',
  CARD: 'default',
  TRANSFER: 'muted',
  OTHER: 'muted',
};

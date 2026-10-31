import { statusLabels } from '@/lib/status/tones';
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

/** Etiquetas; el chip es `StatusBadge kind="paymentMethod"` (neutro: un método no es un estado). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = statusLabels('paymentMethod');

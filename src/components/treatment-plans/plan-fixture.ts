import type { PlanBalance } from '@/lib/payments/payments-api';

/**
 * Campos de opción, presentación y rechazo (DX-040) de un plan suelto, para los
 * planes de ejemplo de los tests.
 */
export const PLAN_WITHOUT_OPTIONS = {
  optionGroupId: null,
  optionLabel: null,
  presentedAt: null,
  presentedLocationId: null,
  rejectedAt: null,
  rejectionReason: null,
  rejectionNote: null,
} as const;

/**
 * Campos de descuento (DX-204) de un ítem sin descuento, para los tests. Sin
 * precio de catálogo (SEC-041): un ítem libre, su precio no es una rebaja.
 */
export const ITEM_WITHOUT_DISCOUNT = {
  catalogPrice: null,
  discountReason: null,
  discountReasonNote: null,
  discountById: null,
  discountAt: null,
  discountLocationId: null,
  // DX-105: sin convenio ni lista, el ítem no lleva foto de origen del precio.
  basePrice: null,
  priceSource: null,
  agreementId: null,
  agreementName: null,
  pricingLocationId: null,
  // DX-050: sin realizar (o realizado antes de DX-050): sin atribución.
  performedById: null,
  performedByName: null,
  performedLocationId: null,
  performedLocationName: null,
  completedAt: null,
  // SEC-050: no es el ítem de un cargo por inasistencia.
  cancellationFeeAppointmentId: null,
} as const;

/**
 * DX-375: la tasa de un abono en la moneda de su plan (no necesita tasa), para
 * los abonos de ejemplo de los tests.
 */
export const PAYMENT_IN_PLAN_CURRENCY = {
  exchangeRateCurrency: null,
  frozenRate: null,
  exchangeRateStatus: 'NOT_NEEDED',
} as const;

/**
 * Campos de la imputación (DX-051) de un saldo sin abonos imputados ni ítems,
 * para los saldos de ejemplo de los tests.
 */
export const BALANCE_WITHOUT_ALLOCATIONS: Pick<
  PlanBalance,
  'allocated' | 'unallocated' | 'unconvertedPaymentsCount' | 'manualPaymentIds' | 'items' | 'paymentsWithoutRate'
> = {
  // DX-375: ningún abono «sin tasa».
  paymentsWithoutRate: [],
  allocated: 0,
  unallocated: 0,
  unconvertedPaymentsCount: 0,
  manualPaymentIds: [],
  items: [],
};

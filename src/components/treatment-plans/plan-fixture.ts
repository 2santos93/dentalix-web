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
} as const;

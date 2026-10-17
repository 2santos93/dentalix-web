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

/** Campos de descuento (DX-204) de un ítem sin descuento, para los tests. */
export const ITEM_WITHOUT_DISCOUNT = {
  discountReason: null,
  discountReasonNote: null,
  discountById: null,
  discountAt: null,
  discountLocationId: null,
} as const;

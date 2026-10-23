import type { AgreementKind } from '@/lib/agreements/agreements-api';
import type { PriceSource } from '@/lib/patients/patient-agreement-api';

/** Tipo de convenio, en el selector del formulario y en la tabla. */
export const AGREEMENT_KIND_LABELS: Record<AgreementKind, string> = {
  PERCENT_DISCOUNT: 'Descuento porcentual',
  PRICE_LIST: 'Lista de precios',
};

/** De dónde sale el precio de referencia de una prestación (`price-quote`). */
export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  CATALOG: 'Precio de catálogo',
  PRICE_LIST: 'Lista de precios de la sede',
  AGREEMENT_PERCENT: 'Convenio',
  AGREEMENT_PRICE_LIST: 'Convenio (lista de precios)',
};

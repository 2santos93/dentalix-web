import type { ClinicRole } from '@/lib/me/me-api';

/**
 * Reglas de descuento de la clínica en la web (DX-204). Son un AVISO antes de
 * enviar: la API aplica las mismas (mismo cálculo, en céntimos enteros) y es
 * la frontera. Espejo de `dentalix-api/src/modules/discounts/domain/discount-policy.ts`.
 */
export interface DiscountRules {
  maxPercentByRole: Record<ClinicRole, number>;
  /** Estrictamente por encima de este %, el motivo es obligatorio. */
  reasonRequiredAbovePercent: number;
}

export type DiscountReasonCode =
  | 'LOYALTY'
  | 'FAMILY_OR_STAFF'
  | 'PROMOTION'
  | 'FINANCIAL_HARDSHIP'
  | 'SERVICE_RECOVERY'
  | 'OTHER';

/** Mismas etiquetas que el CSV del informe (API). */
export const DISCOUNT_REASON_LABELS: Record<DiscountReasonCode, string> = {
  LOYALTY: 'Paciente frecuente',
  FAMILY_OR_STAFF: 'Familiar o personal de la clínica',
  PROMOTION: 'Promoción o campaña',
  FINANCIAL_HARDSHIP: 'Situación económica del paciente',
  SERVICE_RECOVERY: 'Compensación por una incidencia',
  OTHER: 'Otro',
};

export const DISCOUNT_REASON_OPTIONS = Object.keys(DISCOUNT_REASON_LABELS) as DiscountReasonCode[];

export const DISCOUNT_REASON_NOTE_MAX = 200;

export const ROLE_LABELS: Record<ClinicRole, string> = {
  ADMIN: 'Administración',
  DENTIST: 'Odontólogo',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

export function roleCapMessage(maxPercent: number): string {
  return `Tu rol permite hasta un ${maxPercent} % de descuento por ítem.`;
}

function cents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

function basisPoints(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

function exceeds(price: number, discount: number, percent: number): boolean {
  return cents(discount) * BigInt(10000) > cents(price) * basisPoints(percent);
}

/** Tope del rol (0 si no se conoce el rol). */
export function capFor(rules: DiscountRules, role: ClinicRole | null): number {
  return role ? (rules.maxPercentByRole[role] ?? 0) : 0;
}

/** ¿Supera el descuento el tope del rol? (un descuento 0 nunca). */
export function exceedsCap(
  rules: DiscountRules,
  role: ClinicRole | null,
  price: number,
  discount: number,
): boolean {
  return discount > 0 && exceeds(price, discount, capFor(rules, role));
}

/** ¿Pide motivo este descuento? (por encima del umbral). */
export function needsReason(rules: DiscountRules, price: number, discount: number): boolean {
  return discount > 0 && exceeds(price, discount, rules.reasonRequiredAbovePercent);
}

/** % del descuento sobre el precio, con 2 decimales. */
export function discountPercent(price: number, discount: number): number {
  if (price <= 0) return 0;
  return Math.round((discount / price) * 10000) / 100;
}

const ZERO_DECIMAL_CURRENCIES = new Set(['COP', 'CLP', 'JPY', 'KRW', 'PYG']);

export function currencyDecimals(currency: string): 0 | 2 {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/**
 * Descuento de un ítem al aplicarle `percent` % en bloque: redondeado a la
 * unidad de la moneda (mitad hacia arriba), nunca por encima del tope del rol
 * ni del precio. Mismo cálculo que la API (vista previa del diálogo).
 */
export function discountForPercent(
  price: number,
  percent: number,
  currency: string,
  capPercent: number,
): number {
  const unit = BigInt(10) ** BigInt(2 - currencyDecimals(currency));
  const priceCents = cents(price);
  const scale = unit * BigInt(10000);
  const rounded = (priceCents * basisPoints(percent) + scale / BigInt(2)) / scale;
  const capped = (priceCents * basisPoints(capPercent)) / scale;
  const whole = priceCents / unit;
  let units = rounded;
  if (capped < units) units = capped;
  if (whole < units) units = whole;
  return Number(units * unit) / 100;
}

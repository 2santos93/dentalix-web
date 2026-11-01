import type { components } from '@/lib/api/schema';
import { formatCurrency } from '@/lib/format/currency';
import {
  basisPoints,
  bigCents,
  percentOfCentsInUnits,
  unitCents,
  unitsToAmount,
  type RoundingDigits,
} from '@/lib/money/line-rounding';

/*
 * DX-516: ajustes por medio de pago (impuesto, recargo o descuento), espejo
 * del cálculo de la API (`payment-methods/domain/payment-adjustments.ts`),
 * con los mismos vectores (`payment-adjustment-vectors.json`, copia byte a
 * byte). La API es la autoridad: lo que congela el abono es lo que ella
 * calcula; la web solo lo anticipa en el modal del abono.
 *
 * Regla de totales: el importe del abono es lo que se acredita al plan. Cada
 * ajuste se calcula sobre ese importe (sin encadenarse). Impuestos y recargos
 * se cobran aparte; los descuentos cuentan como abono. Lo cobrado = importe +
 * impuestos + recargos − descuentos, nunca negativo.
 */

export type PaymentMethodAdjustment = components['schemas']['PaymentMethodAdjustmentDto'];
export type PaymentAdjustmentLine = components['schemas']['PaymentAdjustmentLineDto'];
export type PaymentAdjustmentType = PaymentMethodAdjustment['type'];
export type PaymentAdjustmentCalculation = PaymentMethodAdjustment['calculation'];

export const ADJUSTMENT_LABEL_MAX = 40;
export const ADJUSTMENTS_PER_METHOD_MAX = 5;

export const PAYMENT_ADJUSTMENT_TYPE_OPTIONS: PaymentAdjustmentType[] = ['TAX', 'SURCHARGE', 'DISCOUNT'];

export const PAYMENT_ADJUSTMENT_TYPE_LABELS: Record<PaymentAdjustmentType, string> = {
  TAX: 'Impuesto',
  SURCHARGE: 'Recargo',
  DISCOUNT: 'Descuento',
};

export const PAYMENT_ADJUSTMENT_CALCULATION_LABELS: Record<PaymentAdjustmentCalculation, string> = {
  PERCENT: 'Porcentaje',
  FIXED: 'Importe fijo',
};

/** Lo que el cálculo necesita de un ajuste configurado. */
export type AdjustmentRule = Pick<
  PaymentMethodAdjustment,
  'type' | 'label' | 'calculation' | 'percent' | 'fixedAmount' | 'fixedCurrency' | 'active'
>;

export interface ComputedAdjustment {
  type: PaymentAdjustmentType;
  label: string;
  calculation: PaymentAdjustmentCalculation;
  percent: number | null;
  fixedAmount: number | null;
  base: number;
  amount: number;
  currency: string;
}

/** ¿Se aplica a un abono en `currency`? (activo; el fijo, solo en su moneda). */
export function adjustmentApplies(rule: AdjustmentRule, currency: string): boolean {
  if (!rule.active) return false;
  if (rule.calculation === 'FIXED') return rule.fixedCurrency?.toUpperCase() === currency.toUpperCase();
  return true;
}

export function adjustmentSign(type: PaymentAdjustmentType): 1 | -1 {
  return type === 'DISCOUNT' ? -1 : 1;
}

/** Las líneas de un abono de `amount` en `currency` (misma regla que la API). */
export function computePaymentAdjustments(
  rules: readonly AdjustmentRule[],
  amount: number,
  currency: string,
  digits: RoundingDigits,
): ComputedAdjustment[] {
  const baseCents = bigCents(amount);
  const zero = BigInt(0);
  if (baseCents <= zero) return [];
  const computed: { rule: AdjustmentRule; cents: bigint }[] = [];
  for (const rule of rules) {
    if (!adjustmentApplies(rule, currency)) continue;
    const cents =
      rule.calculation === 'PERCENT'
        ? percentOfCentsInUnits(baseCents, basisPoints(rule.percent ?? 0), digits, 'half-up') * unitCents(digits)
        : bigCents(rule.fixedAmount ?? 0);
    if (cents > zero) computed.push({ rule, cents });
  }
  let room = computed.filter((c) => c.rule.type !== 'DISCOUNT').reduce((sum, c) => sum + c.cents, baseCents);
  return computed
    .map((c) => {
      if (c.rule.type !== 'DISCOUNT') return c;
      const cents = c.cents > room ? room : c.cents;
      room -= cents;
      return { ...c, cents };
    })
    .filter((c) => c.cents > zero)
    .map((c) => ({
      type: c.rule.type,
      label: c.rule.label,
      calculation: c.rule.calculation,
      percent: c.rule.calculation === 'PERCENT' ? c.rule.percent : null,
      fixedAmount: c.rule.calculation === 'FIXED' ? c.rule.fixedAmount : null,
      base: amount,
      amount: unitsToAmount(c.cents / unitCents(digits), digits),
      currency,
    }));
}

/** Lo cobrado: importe + impuestos + recargos − descuentos (en céntimos exactos). */
export function collectedAmount(
  amount: number,
  lines: readonly { type: PaymentAdjustmentType; amount: number }[],
): number {
  const cents = lines.reduce((sum, l) => sum + adjustmentSign(l.type) * Math.round(l.amount * 100), Math.round(amount * 100));
  return cents / 100;
}

/** «3 %», «7,5 %»: hasta 2 decimales, con la coma de los importes. */
export function percentText(percent: number): string {
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(percent)} %`;
}

/** «3 %» o «2,00 USD»: cómo se calcula un ajuste configurado. */
export function adjustmentCalculationText(rule: Pick<AdjustmentRule, 'calculation' | 'percent' | 'fixedAmount' | 'fixedCurrency'>): string {
  if (rule.calculation === 'PERCENT') return percentText(rule.percent ?? 0);
  return formatCurrency(rule.fixedAmount ?? 0, rule.fixedCurrency ?? '');
}

/** El importe con signo de una línea: «+3,00 USD» o «−5,00 USD». */
export function signedAdjustmentAmount(line: { type: PaymentAdjustmentType; amount: number; currency: string }): string {
  return `${adjustmentSign(line.type) < 0 ? '−' : '+'}${formatCurrency(line.amount, line.currency)}`;
}

/**
 * Cómo se explica una línea congelada: «3 % de 100,00 USD» o «Importe fijo».
 * El tipo y la etiqueta van aparte.
 */
export function adjustmentBasisText(line: Pick<ComputedAdjustment, 'calculation' | 'percent' | 'base' | 'currency'>): string {
  return line.calculation === 'PERCENT'
    ? `${percentText(line.percent ?? 0)} de ${formatCurrency(line.base, line.currency)}`
    : PAYMENT_ADJUSTMENT_CALCULATION_LABELS.FIXED;
}

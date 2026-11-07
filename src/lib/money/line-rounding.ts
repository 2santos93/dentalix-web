/*
 * Redondeo por línea (DX-340), espejo de
 * `dentalix-api/src/shared/money/line-rounding.ts`: cada línea (precio −
 * descuento) se redondea UNA vez a los `roundingDigits` de su moneda, la
 * mitad hacia arriba, y el total de un documento es la suma exacta de sus
 * líneas. Los dígitos NO salen de una lista de la web: llegan en el contrato
 * de la API (`currencyDigits` del plan, `GET /currencies`). Los mismos
 * vectores (`rounding-vectors.json`) fijan la paridad con la API. Pintar un
 * importe es otra cosa (`formatCurrency`, dígitos de formato CLDR).
 */

import { amountCents, centsToAmount } from './round';

/** Decimales del redondeo por línea: los importes tienen como mucho 2. */
export type RoundingDigits = 0 | 1 | 2;

const TEN_THOUSAND = BigInt(10000);
const TWO = BigInt(2);

/** Valida unos dígitos de redondeo (0, 1 o 2); si no, error explícito. */
export function roundingDigits(digits: number): RoundingDigits {
  if (digits === 0 || digits === 1 || digits === 2) return digits;
  throw new RangeError(
    `Dígitos de redondeo no admitidos: ${digits} (los importes tienen como mucho 2 decimales).`,
  );
}

/** Unidad de la moneda en céntimos: 1 (2 decimales), 10 (1) o 100 (0). */
export function unitCents(digits: RoundingDigits): bigint {
  return BigInt(10) ** BigInt(2 - roundingDigits(digits));
}

/** Importe → céntimos BigInt (redondeo al céntimo más cercano, como la API). */
export function bigCents(amount: number): bigint {
  return BigInt(amountCents(amount));
}

/** Un % (hasta 2 decimales) en puntos básicos: 7,5 % → 750. */
export function basisPoints(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

/** `cents × bp / 10000` en unidades de la moneda, la mitad hacia arriba o por debajo. */
export function percentOfCentsInUnits(
  cents: bigint,
  bp: bigint,
  digits: RoundingDigits,
  mode: 'half-up' | 'floor',
): bigint {
  const scale = unitCents(digits) * TEN_THOUSAND;
  const numerator = cents * bp;
  return mode === 'half-up' ? (numerator + scale / TWO) / scale : numerator / scale;
}

/** Unidades de la moneda → importe. */
export function unitsToAmount(units: bigint, digits: RoundingDigits): number {
  return centsToAmount(Number(units * unitCents(digits)));
}

export interface MoneyLine {
  price: number;
  discount: number;
}

/** Importe de una línea en céntimos exactos: precio − descuento. */
export function lineCents(line: MoneyLine): number {
  return amountCents(line.price) - amountCents(line.discount);
}

/** Total de un documento: la suma exacta de sus líneas. */
export function linesTotal(lines: readonly MoneyLine[]): number {
  return centsToAmount(lines.reduce((sum, line) => sum + lineCents(line), 0));
}

/**
 * Cuotas de un plan de pagos (DX-488), espejo de `generateSchedule` de la API:
 * en unidades de `roundingDigits` de la moneda (1, 10 o 100 céntimos), las
 * cuotas 1…n−1 valen `floor(financiado / unidad / n) · unidad` y la última el
 * resto, céntimos sueltos incluidos (JPY 10000 en 3 = 3333, 3333, 3334). Con 2
 * dígitos es el reparto al céntimo de siempre. La suma es exacta. Sin cuotas
 * válidas (n entero ≥ 1) o con un financiado negativo, `[]`.
 */
export function installmentAmounts(financed: number, count: number, digits: RoundingDigits): number[] {
  const financedCents = amountCents(financed);
  if (!Number.isInteger(count) || count < 1 || financedCents < 0) return [];
  const unit = unitCents(digits);
  const baseCents = Number((BigInt(financedCents) / unit / BigInt(count)) * unit);
  const lastCents = financedCents - baseCents * (count - 1);
  return Array.from({ length: count }, (_, i) => centsToAmount(i === count - 1 ? lastCents : baseCents));
}

/**
 * Los dígitos de redondeo que manda la API (`currencyDigits` del plan, una
 * moneda de `GET /currencies`); `null` si no llegan (API anterior a DX-340) o
 * no son válidos: la web no los adivina con una lista propia y nunca lanza
 * durante el render (la pantalla dice «se calcula al aplicar»).
 */
export function contractRoundingDigits(
  digits: { roundingDigits: number } | null | undefined,
): RoundingDigits | null {
  const value = digits?.roundingDigits;
  return value === 0 || value === 1 || value === 2 ? value : null;
}

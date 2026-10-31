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

/** Decimales del redondeo por línea: los importes tienen como mucho 2. */
export type RoundingDigits = 0 | 1 | 2;

const HUNDRED = BigInt(100);
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
  return BigInt(Math.round(amount * 100));
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
  return Number(units * unitCents(digits)) / Number(HUNDRED);
}

export interface MoneyLine {
  price: number;
  discount: number;
}

/** Importe de una línea en céntimos exactos: precio − descuento. */
export function lineCents(line: MoneyLine): number {
  return Math.round(line.price * 100) - Math.round(line.discount * 100);
}

/** Total de un documento: la suma exacta de sus líneas. */
export function linesTotal(lines: readonly MoneyLine[]): number {
  return lines.reduce((sum, line) => sum + lineCents(line), 0) / 100;
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

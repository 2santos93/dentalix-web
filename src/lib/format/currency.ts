// Copia byte a byte de `prisma/reference/iso4217-zero-decimal.json` de la API: no se edita aquí.
// La fuente es la API; `scripts/check-api-reference-sync.mjs` (CI) falla si
// divergen. Ver src/lib/money/README.md.
import iso4217ZeroDecimal from '@/lib/money/iso4217-zero-decimal.json';

/** Monedas sin decimales según ISO 4217 (copia de la lista de la API, R7). */
const ISO_ZERO_DECIMAL: ReadonlySet<string> = new Set(iso4217ZeroDecimal.minorUnitsZero);

/**
 * Crash-safe currency formatter. `Intl.NumberFormat({ style:'currency' })`
 * throws a RangeError on an invalid/unknown ISO 4217 code — which, when called
 * during render, tears down the whole subtree. This never throws: on any
 * failure it falls back to `` `${currency} ${amount}` ``. Use this everywhere
 * instead of constructing `Intl.NumberFormat` inline.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = 'es',
): string {
  // Dos decimales fijos: los importes se guardan con céntimos, y las
  // versiones recientes de ICU/CLDR dan 0 decimales a COP, con lo que
  // 150.000,50 se pintaría (redondeado) como 150.001. Las monedas que en ISO
  // 4217 no tienen decimales (JPY, VND…: GLOBAL-G1) van sin ellos cuando el
  // importe es entero; con céntimos conserva 2 decimales, nunca se redondea.
  const digits = Number.isInteger(amount) && ISO_ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(digits)}`;
  }
}

/**
 * Un importe sin moneda, con los mismos dos decimales fijos (`80.000,00`). Para
 * cuando la moneda no se conoce: mejor un número sin símbolo que uno con la
 * moneda equivocada.
 */
export function formatAmount(amount: number, locale = 'es'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

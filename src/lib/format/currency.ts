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
  try {
    // Dos decimales fijos: los importes se guardan con céntimos, y las
    // versiones recientes de ICU/CLDR dan 0 decimales a COP, con lo que
    // 150.000,50 se pintaría (redondeado) como 150.001.
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
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

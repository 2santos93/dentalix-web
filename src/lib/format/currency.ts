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
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

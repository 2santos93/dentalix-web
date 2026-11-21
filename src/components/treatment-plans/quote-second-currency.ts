import type { ExchangeRatesState } from '@/components/payments/use-exchange-rates';
import { bcvValueDateFor, quoteFromRates, ratePerBase } from '@/lib/payments/payment-rate';
import type { QuoteSecondCurrency } from './plan-quote-document';

/**
 * DX-376: la 2.ª moneda lista para el documento (o para «Presentar», DX-560)
 * con la tasa de hoy de la clínica, o la moneda que no tiene tasa. `null`
 * mientras no hay tasas.
 */
export function secondCurrencyOf(
  state: ExchangeRatesState,
  planCurrency: string,
  second: string,
  date: string,
): { value: QuoteSecondCurrency } | { missing: string } | null {
  if (state.status !== 'ready') return null;
  // La misma tasa que congelaría un abono de hoy (8 decimales, DX-375).
  const quote = quoteFromRates(state.rates, planCurrency, second);
  if (quote === null) {
    return { missing: ratePerBase(state.rates, planCurrency) === null ? planCurrency : second };
  }
  const { fromPerBase, toPerBase } = quote;
  const { source } = state.rates;
  const valueDate = bcvValueDateFor(state.rates, planCurrency, second);
  return { value: { currency: second, fromPerBase, toPerBase, source, date, valueDate } };
}

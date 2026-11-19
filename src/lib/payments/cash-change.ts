import { amountCents, centsToAmount } from '@/lib/money/round';
import { floorToDigits, unitCents, type RoundingDigits } from '@/lib/money/line-rounding';
import { convertWithRate, quoteFromRates, type RateQuote, type RatesOfDay } from './payment-rate';

/*
 * DX-570: vuelto al cobrar en efectivo. La misma cuenta que la API
 * (`settleCashChange`), en céntimos de la moneda del abono:
 *
 *   debido = recibido − cobrado (importe ± ajustes por medio de pago)
 *   vuelto = Σ equivalentes de cada línea (con la tasa del día, al céntimo)
 *   resto  = debido − vuelto
 *
 * Solo anticipa: lo que vale es lo que congela la API. Ningún texto ni regla
 * sabe de países, bancos ni monedas concretas.
 */

/** Código del 422 «queda una diferencia sin devolver» de la API. */
export const CASH_CHANGE_REMAINDER = 'CASH_CHANGE_REMAINDER';
/** Líneas de vuelto como mucho (la API: 3). */
export const CHANGE_MAX_LINES = 3;

/** El equivalente de una línea en la moneda del abono, o por qué no se sabe. */
export type ChangeEquivalent =
  | { status: 'ready'; amount: number; quote: RateQuote | null }
  | { status: 'loading' }
  | { status: 'unavailable' };

/**
 * Lo que vale una línea de vuelto en la moneda del abono: la misma conversión
 * que hace la API al congelar la tasa del día (`convertWithQuote`). En la
 * misma moneda, el importe tal cual.
 */
export function changeEquivalent(
  amount: number,
  lineCurrency: string,
  paymentCurrency: string,
  rates: RatesOfDay | 'loading' | 'unavailable',
): ChangeEquivalent {
  if (lineCurrency === paymentCurrency) return { status: 'ready', amount, quote: null };
  if (rates === 'loading') return { status: 'loading' };
  if (rates === 'unavailable') return { status: 'unavailable' };
  const quote = quoteFromRates(rates, lineCurrency, paymentCurrency);
  if (quote === null) return { status: 'unavailable' };
  return { status: 'ready', amount: convertWithRate(amount, quote), quote };
}

/**
 * Cuánto entregar en `lineCurrency` para devolver `due` (en la moneda del
 * abono): redondeado HACIA ABAJO a los decimales de esa moneda (DX-340) y
 * ajustado para que su equivalente nunca supere lo debido (la API lo
 * rechazaría). `null` sin tasa o sin nada que devolver.
 */
export function suggestedChange(
  due: number,
  lineCurrency: string,
  paymentCurrency: string,
  rates: RatesOfDay | 'loading' | 'unavailable',
  digits: RoundingDigits,
): number | null {
  if (!(due > 0)) return null;
  if (lineCurrency === paymentCurrency) return floorToDigits(due, digits);
  if (rates === 'loading' || rates === 'unavailable') return null;
  const quote = quoteFromRates(rates, paymentCurrency, lineCurrency);
  const back = quoteFromRates(rates, lineCurrency, paymentCurrency);
  if (quote === null || back === null) return null;
  const raw = (due / quote.fromPerBase) * quote.toPerBase;
  let amount = floorToDigits(raw, digits);
  const unit = Number(unitCents(digits));
  // El redondeo de la vuelta puede pasarse por un céntimo: se baja una unidad.
  for (let i = 0; i < 3 && amount > 0; i++) {
    if (amountCents(convertWithRate(amount, back)) <= amountCents(due)) break;
    amount = centsToAmount(amountCents(amount) - unit);
  }
  return amount > 0 ? amount : null;
}

export type CashChangeSettlement =
  | { kind: 'empty' }
  | { kind: 'below-collected'; collected: number }
  | { kind: 'pending' }
  | { kind: 'exceeds'; due: number; change: number }
  | { kind: 'ok'; due: number; change: number; remainder: number };

/**
 * El cuadre del vuelto con lo que se sabe: `pending` si falta lo cobrado o
 * la tasa de alguna línea; `ok` trae el resto (0 si el vuelto lo cubre).
 */
export function settleCashChange(input: {
  tendered: number | null;
  collected: number | null;
  equivalents: readonly ChangeEquivalent[];
}): CashChangeSettlement {
  if (input.tendered === null) return { kind: 'empty' };
  if (input.collected === null) return { kind: 'pending' };
  const dueCents = amountCents(input.tendered) - amountCents(input.collected);
  if (dueCents < 0) return { kind: 'below-collected', collected: input.collected };
  let changeCents = 0;
  for (const equivalent of input.equivalents) {
    if (equivalent.status !== 'ready') return { kind: 'pending' };
    changeCents += amountCents(equivalent.amount);
  }
  const due = centsToAmount(dueCents);
  const change = centsToAmount(changeCents);
  if (changeCents > dueCents) return { kind: 'exceeds', due, change };
  return { kind: 'ok', due, change, remainder: centsToAmount(dueCents - changeCents) };
}

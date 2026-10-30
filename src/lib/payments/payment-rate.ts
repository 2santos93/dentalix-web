import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import type { Payment } from './payments-api';

/** Estado de la tasa de un abono (DX-375). */
export type PaymentExchangeRateStatus = Payment['exchangeRateStatus'];

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const paymentRateCopy = {
  missing: 'Sin tasa',
  missingHelp: 'Falta la tasa de cambio de su día: el saldo no lo cuenta todavía.',
  source: { AUTOMATIC: 'automática', MANUAL: 'manual' } as const,
  frozen: (pair: string, source: string, date: string) => `Tasa congelada: ${pair} · ${source} · ${date}`,
};

/**
 * Una cotización entre la moneda de un abono y la de su destino: las dos en
 * unidades por 1 de la moneda base, como las da la fuente de la clínica (la
 * misma forma que la tasa congelada de un abono, DX-375, y que la lectura de
 * `GET /exchange/rates`).
 */
export interface RateQuote {
  /** Moneda de destino (la del plan). */
  currency: string;
  /** Unidades de la moneda del abono por 1 de la base. */
  fromPerBase: number;
  /** Unidades de `currency` por 1 de la base. */
  toPerBase: number;
}

/**
 * «1 USD = 4.000,00 COP»: con la moneda mayor a la izquierda, para que la
 * cifra nunca sea un 0,000… ilegible. `money` pinta un importe con su moneda.
 */
export function ratePairLabel(
  paymentCurrency: string,
  rate: RateQuote,
  money: (amount: number, currency: string) => string,
): string {
  // Unidades de la moneda del abono por 1 de la moneda de destino.
  const paymentPerTarget = rate.fromPerBase / rate.toPerBase;
  return paymentPerTarget >= 1
    ? `1 ${rate.currency} = ${money(paymentPerTarget, paymentCurrency)}`
    : `1 ${paymentCurrency} = ${money(1 / paymentPerTarget, rate.currency)}`;
}

/**
 * El abono en la moneda de destino con una cotización: abono → base →
 * destino, redondeado a céntimos solo al final. La misma cuenta que hace la
 * API al congelar la tasa (`convertWithQuote`), así la previsualización del
 * cobro coincide céntimo a céntimo con lo que guarda.
 */
export function convertWithRate(amount: number, rate: Pick<RateQuote, 'fromPerBase' | 'toPerBase'>): number {
  return Math.round((amount / rate.fromPerBase) * rate.toPerBase * 100) / 100;
}

/**
 * La tasa que congeló un abono (DX-375), legible: «1 USD = COP 4.000,00» con
 * la moneda mayor a la izquierda, sale de las dos tasas por unidad base que
 * guardó, la fuente y el día. Cifra y día con el formato de la sede y el
 * código ISO (DX-378); sin formato de la sede, «—» en su lugar. `null` si no
 * congeló ninguna.
 */
export function frozenRateLabel(
  payment: Pick<Payment, 'currency' | 'frozenRate'>,
  fmt: RegionalFormat | null,
): string | null {
  const rate = payment.frozenRate;
  if (!rate) return null;
  const pair = ratePairLabel(payment.currency, rate, (amount, currency) => sedeMoney(amount, currency, fmt));
  return paymentRateCopy.frozen(pair, paymentRateCopy.source[rate.source], sedeCivilDate(rate.date, fmt));
}

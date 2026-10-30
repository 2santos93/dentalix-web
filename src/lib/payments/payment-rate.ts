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
  // Unidades de la moneda del abono por 1 de la moneda de destino.
  const paymentPerTarget = rate.fromPerBase / rate.toPerBase;
  const pair =
    paymentPerTarget >= 1
      ? `1 ${rate.currency} = ${sedeMoney(paymentPerTarget, payment.currency, fmt)}`
      : `1 ${payment.currency} = ${sedeMoney(1 / paymentPerTarget, rate.currency, fmt)}`;
  return paymentRateCopy.frozen(pair, paymentRateCopy.source[rate.source], sedeCivilDate(rate.date, fmt));
}

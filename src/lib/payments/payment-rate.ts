import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import type { Payment } from './payments-api';
import { roundAmount } from '@/lib/money/round';
import type { ExchangeRateSource } from '@/lib/exchange/exchange-settings-api';
import type { components } from '@/lib/api/schema';

/**
 * DX-586: la tasa con que se cobró un abono, tal como la congeló la API: «1
 * `unit` = `rate` `currency`» (`unit`, la más fuerte de las dos), su fuente, la
 * fecha valor del BCV (solo con BCV), cuándo se cotizó (hora de la BD) y su
 * referencia estable (`BCV:<fecha valor>`, `MANUAL:<id>`, …). `null` en los
 * abonos sin conversión, «sin tasa» o congelados antes de DX-586.
 */
export type PaymentRateUsed = components['schemas']['PaymentRateUsedDto'];

/** Estado de la tasa de un abono (DX-375). */
export type PaymentExchangeRateStatus = Payment['exchangeRateStatus'];

// Copy como constantes (i18n-ready). Solo la fuente BCV (DX-585), que elige
// la clínica, nombra un banco; el resto de textos no nombra país ni banco.
export const paymentRateCopy = {
  missing: 'Sin tasa',
  missingHelp: 'Falta la tasa de cambio de su día: el saldo no lo cuenta todavía.',
  source: { AUTOMATIC: 'automática', MANUAL: 'manual', BCV: 'BCV' } satisfies Record<ExchangeRateSource, string>,
  /** DX-585: «BCV, fecha valor 20/11/2026». */
  bcvValueDate: (date: string) => `BCV, fecha valor ${date}`,
  frozen: (pair: string, source: string, date: string) => `Tasa congelada: ${pair} · ${source} · ${date}`,
  /** DX-384: la tasa es la última registrada, de un día anterior al del abono. */
  rateOfDay: (date: string) => `tasa del ${date}`,
  /** DX-586: «Tasa usada: 1 USD = Bs. 918,77 (BCV, fecha valor 20/11/2026)». */
  used: (pair: string, detail: string) => `Tasa usada: ${pair} (${detail})`,
  /** DX-586: sin fecha valor, la fuente y cuándo se cotizó: «manual, 21/11/2026 14:35». */
  usedAt: (source: string, when: string) => `${source}, ${when}`,
  /** DX-586: la tasa cambió entre abrir el cobro y confirmarlo. */
  changed: (used: string, shown: string) =>
    `La tasa cambió mientras cobrabas: se cobró con ${used}, no con ${shown}, que era la que se veía.`,
};

/** Lo que hace falta para pintar la tasa usada: importes, días y un instante, en el formato que toque. */
export interface RateUsedPainters {
  money: (amount: number, currency: string) => string;
  civilDate: (day: string) => string;
  /** Fecha y hora de un instante en la zona de la sede. */
  dateTime: (iso: string) => string;
}

/** DX-586: «1 USD = Bs. 918,77», de la tasa usada (la moneda más fuerte a la izquierda). */
export function rateUsedPair(used: PaymentRateUsed, money: RateUsedPainters['money']): string {
  return `1 ${used.unit} = ${money(used.rate, used.currency)}`;
}

/**
 * DX-586: de dónde salió la tasa usada: «BCV, fecha valor 20/11/2026» o, sin
 * fecha valor, la fuente y cuándo se cotizó («manual, 21/11/2026 14:35»).
 */
export function rateUsedDetail(used: PaymentRateUsed, painters: Omit<RateUsedPainters, 'money'>): string {
  if (used.source === 'BCV' && used.valueDate) return paymentRateCopy.bcvValueDate(painters.civilDate(used.valueDate));
  return paymentRateCopy.usedAt(paymentRateCopy.source[used.source], painters.dateTime(used.quotedAt));
}

/** DX-586: «Tasa usada: 1 USD = Bs. 918,77 (BCV, fecha valor 20/11/2026)». */
export function rateUsedLabel(used: PaymentRateUsed, painters: RateUsedPainters): string {
  return paymentRateCopy.used(rateUsedPair(used, painters.money), rateUsedDetail(used, painters));
}

/**
 * DX-586: ¿la tasa con que la API cobró es la que se enseñó antes de
 * confirmar? Compara la cifra (no la referencia): si dos tasas valen lo mismo,
 * el abono vale lo mismo. Tolerancia relativa de 1e-7 (la API guarda 8 decimales).
 */
export function rateUsedMatchesQuote(used: PaymentRateUsed, paymentCurrency: string, quote: RateQuote): boolean {
  // Unidades de la moneda del abono por 1 de la de destino.
  const paymentPerTarget = quote.fromPerBase / quote.toPerBase;
  let expected: number;
  if (used.unit === quote.currency && used.currency === paymentCurrency) expected = paymentPerTarget;
  else if (used.unit === paymentCurrency && used.currency === quote.currency) expected = 1 / paymentPerTarget;
  else return false;
  return Math.abs(used.rate - expected) <= Math.abs(expected) * 1e-7;
}

/**
 * DX-384: el día de la tasa para mostrarlo junto a un abono (o a su vista
 * previa), con `formatDay` (el formato de la sede). Si es el del propio abono, el día tal
 * cual; si es anterior (la clínica no registró la de ese día y se usó la
 * última dentro de su plazo), «tasa del 30/10/2026», para que no se lea como
 * la tasa del día del abono.
 */
export function rateDayLabel(rateDate: string, paidOn: string, formatDay: (day: string) => string): string {
  const day = formatDay(rateDate);
  return rateDate === paidOn ? day : paymentRateCopy.rateOfDay(day);
}

/** DX-585: las monedas que, con la fuente BCV, salen del BCV (el resto, del proveedor). */
export const BCV_CURRENCIES: readonly string[] = ['VES', 'EUR'];

/**
 * DX-585: la fuente de una tasa, legible: «automática», «manual», «BCV» o,
 * con la fecha valor del BCV (si la API la da), «BCV, fecha valor 20/11/2026».
 */
export function rateSourceText(
  source: ExchangeRateSource,
  valueDate: string | null | undefined,
  formatDay: (day: string) => string,
): string {
  if (source === 'BCV' && valueDate) return paymentRateCopy.bcvValueDate(formatDay(valueDate));
  return paymentRateCopy.source[source];
}

/**
 * DX-585: la fecha valor del BCV que aplica a una conversión entre `from` y
 * `to` con las tasas de un día: solo con fuente BCV y si alguna de las dos
 * monedas sale del BCV (VES o EUR). `null` en cualquier otro caso.
 */
export function bcvValueDateFor(
  day: { source: ExchangeRateSource; bcv?: { valueDate: string } | null },
  from: string,
  to: string,
): string | null {
  if (day.source !== 'BCV' || !day.bcv) return null;
  return BCV_CURRENCIES.includes(from) || BCV_CURRENCIES.includes(to) ? day.bcv.valueDate : null;
}

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

/** Las tasas de un día como las da `GET /exchange/rates`: unidades por 1 de `base`. */
export interface RatesOfDay {
  base: string;
  rates: Record<string, number>;
}

/**
 * Unidades de `currency` por 1 de la base ese día, con los 8 decimales que
 * guarda la columna de la tasa congelada (`Decimal(18,8)`, DX-375): la API
 * recorta así la tasa al congelar un abono. `null` sin tasa, o si la tasa
 * redondea a 0 (la API también la trata como «sin tasa»).
 */
export function ratePerBase(day: RatesOfDay, currency: string): number | null {
  if (currency === day.base) return 1;
  const raw = day.rates[currency];
  if (raw === undefined) return null;
  const rate = Number(raw.toFixed(8));
  return rate > 0 ? rate : null;
}

/**
 * La cotización de `from` a `to` con las tasas de un día, la misma que la API
 * congelaría para un abono de ese día (`freezePaymentRate`), o `null` si falta
 * alguna de las dos («sin tasa»).
 */
export function quoteFromRates(day: RatesOfDay, from: string, to: string): RateQuote | null {
  const fromPerBase = ratePerBase(day, from);
  const toPerBase = ratePerBase(day, to);
  return fromPerBase === null || toPerBase === null ? null : { currency: to, fromPerBase, toPerBase };
}

/**
 * «1 USD = 18,50 MXN»: con la moneda mayor a la izquierda, para que la
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
  return roundAmount((amount / rate.fromPerBase) * rate.toPerBase);
}

/**
 * La tasa que congeló un abono (DX-375), legible: «1 USD = MXN 18,50» con
 * la moneda mayor a la izquierda, sale de las dos tasas por unidad base que
 * guardó, la fuente y el día. Cifra y día con el formato de la sede y el
 * código ISO (DX-378); sin formato de la sede, «—» en su lugar. `null` si no
 * congeló ninguna.
 */
export function frozenRateLabel(
  payment: Pick<Payment, 'currency' | 'frozenRate' | 'paidOn'> & { rateUsed?: PaymentRateUsed | null },
  fmt: RegionalFormat | null,
  timeZone: string | null = null,
): string | null {
  const rate = payment.frozenRate;
  if (!rate) return null;
  const money = (amount: number, currency: string) => sedeMoney(amount, currency, fmt);
  // DX-586: con la tasa usada, qué tasa y cuándo (fecha valor del BCV u hora de la cotización).
  if (payment.rateUsed) {
    return rateUsedLabel(payment.rateUsed, {
      money,
      civilDate: (day) => sedeCivilDate(day, fmt),
      dateTime: (iso) => (fmt && timeZone ? fmt.dateTime(new Date(iso), timeZone) : NO_SEDE_FORMAT),
    });
  }
  const pair = ratePairLabel(payment.currency, rate, money);
  return paymentRateCopy.frozen(pair, paymentRateCopy.source[rate.source], rateDayLabel(rate.date, payment.paidOn, (day) => sedeCivilDate(day, fmt)));
}

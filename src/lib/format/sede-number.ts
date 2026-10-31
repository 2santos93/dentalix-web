import iso4217ZeroDecimal from '@/lib/money/iso4217-zero-decimal.json';
import type { RegionalFormat } from '@/lib/format/regional-format';

/**
 * Lo que se pinta en lugar de un valor que depende del formato de la sede
 * mientras carga o si la sede no lo tiene (spec G1-B §10): nunca otro formato.
 */
export const NO_SEDE_FORMAT = '—';

/** Monedas que se pintan sin decimales cuando el importe es entero (misma regla que `formatCurrency`). */
const ZERO_DECIMAL: ReadonlySet<string> = new Set(iso4217ZeroDecimal.minorUnitsZero);
const BIDI_MARKS_RE = /[‎‏؜]/g;
const codeFormatters = new Map<string, Intl.NumberFormat>();

/** Un recuento o una medida con el formato de la sede («1,234», «1.234»), o «—». */
export function sedeNumber(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.number(value) : NO_SEDE_FORMAT;
}

/**
 * Un importe con los separadores de la sede y SIEMPRE el código ISO de su
 * moneda («MXN 2.195.000,00», «2.195.000,00 MXN», «USD 1,234.50»), nunca un
 * símbolo: en un producto bimonetario «$» no dice si son pesos o dólares
 * (DX-378). Mismos decimales que `formatCurrency`: 2, o 0 en una moneda sin
 * unidad menor con importe entero. Nunca lanza: un código que Intl no acepta
 * se pinta tal cual delante de la cifra.
 */
export function moneyWithCode(amount: number, currency: string, fmt: RegionalFormat): string {
  const digits = ZERO_DECIMAL.has(currency.toUpperCase()) && Number.isInteger(amount) ? 0 : 2;
  const key = `${fmt.locale}|${currency}|${digits}`;
  try {
    let formatter = codeFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(fmt.locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        numberingSystem: 'latn',
      });
      codeFormatters.set(key, formatter);
    }
    return formatter.format(amount).replace(BIDI_MARKS_RE, '');
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `${currency} ${fmt.number(amount, { min: digits, max: digits })}`;
  }
}

/** Un importe con el formato de la sede y el código de su moneda (DX-378), o «—» sin él. */
export function sedeMoney(amount: number, currency: string, fmt: RegionalFormat | null): string {
  return fmt ? moneyWithCode(amount, currency, fmt) : NO_SEDE_FORMAT;
}

/** Un día civil `YYYY-MM-DD` con el formato de la sede (DX-378), o «—» sin él. */
export function sedeCivilDate(day: string, fmt: RegionalFormat | null): string {
  return fmt ? fmt.civilDate(day) : NO_SEDE_FORMAT;
}

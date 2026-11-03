import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, moneyWithCode } from '@/lib/format/sede-number';
import type { CurrencyTexts } from '@/lib/format/currency-text';

/** El formato de un documento: el helper de la sede y la zona con la que pintar sus instantes. */
export interface DocumentFormat {
  fmt: RegionalFormat;
  timeZone: string;
}

/** La sede de un documento, en crudo, tal como la devuelve la API (`regional`). */
export interface DocumentRegionalInput {
  timeZone: string | null;
  locale: string | null;
  hourCycle: 'h12' | 'h23' | null;
}

/** Lo que se pinta en un documento cuando su sede no tiene formato: nunca otro formato. */
export const NO_DOCUMENT_FORMAT = NO_SEDE_FORMAT;

/**
 * Formato de un impreso o de una página pública (DX-354, D1): el de la sede del
 * documento, con sus valores actuales, no el de la sede activa ni el del
 * navegador. `null` si falta el locale, el reloj o la zona, o si este
 * navegador no sabe formatear con ellos, también con una zona guardada
 * inválida (pre-flight M16 de DX-324). Quien imprime pinta «—» y
 * `SedeConfigError`; nunca otro formato en su lugar.
 */
export function documentFormat(
  regional: DocumentRegionalInput | null | undefined,
): DocumentFormat | null {
  const locale = regional?.locale;
  const hourCycle = regional?.hourCycle;
  const timeZone = regional?.timeZone;
  if (!locale || !hourCycle || !timeZone) return null;
  try {
    const fmt = regionalFormat({ locale, hourCycle });
    fmt.date(new Date(0), timeZone);
    return { fmt, timeZone };
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

/** Lo que un documento pinta con el formato de su sede; sin él, «—» en todo. */
export interface DocumentTexts {
  /** Un importe con el código ISO de su moneda (DX-378), o el texto de la clínica para ella. */
  amount(value: number, currency: string): string;
  /** Un día civil `YYYY-MM-DD`; un día mal formado sale «—». */
  civilDate(day: string | null | undefined): string;
  /** La fecha de un instante ISO en la zona de la sede. */
  date(iso: string | null | undefined): string;
  /** La hora de un instante ISO en la zona y el reloj de la sede. */
  time(iso: string | null | undefined): string;
  /** Fecha y hora de un instante ISO en la zona y el reloj de la sede. */
  dateTime(iso: string | null | undefined): string;
}

function instant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Los pintores de un documento con su `DocumentFormat`. Con `null` (la sede no
 * tiene formato) todo sale «—», nunca otro formato (DX-354). `texts`: los
 * textos de moneda de la clínica salvo que el documento traiga los suyos
 * congelados (el recibo).
 */
export function documentTexts(format: DocumentFormat | null, texts?: CurrencyTexts): DocumentTexts {
  if (!format) {
    return {
      amount: () => NO_DOCUMENT_FORMAT,
      civilDate: () => NO_DOCUMENT_FORMAT,
      date: () => NO_DOCUMENT_FORMAT,
      time: () => NO_DOCUMENT_FORMAT,
      dateTime: () => NO_DOCUMENT_FORMAT,
    };
  }
  const { fmt, timeZone } = format;
  const at = (iso: string | null | undefined, paint: (d: Date) => string): string => {
    const d = instant(iso);
    return d ? paint(d) : NO_DOCUMENT_FORMAT;
  };
  return {
    amount: (value, currency) => moneyWithCode(value, currency, fmt, texts),
    civilDate: (day) => {
      if (!day) return NO_DOCUMENT_FORMAT;
      try {
        return fmt.civilDate(day.slice(0, 10));
      } catch (e) {
        if (e instanceof RangeError) return NO_DOCUMENT_FORMAT;
        throw e;
      }
    },
    date: (iso) => at(iso, (d) => fmt.date(d, timeZone)),
    time: (iso) => at(iso, (d) => fmt.time(d, timeZone)),
    dateTime: (iso) => at(iso, (d) => fmt.dateTime(d, timeZone)),
  };
}

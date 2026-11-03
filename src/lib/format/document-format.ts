import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';

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

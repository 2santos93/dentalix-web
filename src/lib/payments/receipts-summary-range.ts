import { endOfMonth, startOfMonth, startOfYear, type CalendarDate } from '@internationalized/date';
import { isoToCalendarDate, type IsoRange } from '@/lib/dates/iso';

/**
 * El periodo del recibo resumen (DX-401): dos días civiles de la sede, ambos
 * incluidos. Las reglas son las de la API (que vuelve a comprobarlas con un
 * 400 en español); aquí solo se adelantan para decirlo junto al campo.
 */

/** Días que puede abarcar el periodo, contando el primero y el último. */
export const MAX_SUMMARY_DAYS = 366;

export const summaryRangeCopy = {
  missing: 'Elige el primer y el último día del período.',
  // Los 400 de la API (`receipt-summary.ts`). El de orden, sin su «usa fechas AAAA-MM-DD»:
  // aquí la fecha se elige en el calendario con el formato de la sede, nunca se teclea en ISO.
  fromAfterTo: 'El período no es válido: «Desde» tiene que ser anterior o igual a «Hasta».',
  tooLong: `El período del resumen admite como mucho ${MAX_SUMMARY_DAYS} días.`,
  outOfBounds: 'Las fechas del período tienen que estar entre el 01/01/2000 y el 31/12/2100.',
};

/** Los días que acepta la API (ambos incluidos). */
const FIRST_DAY = '2000-01-01';
const LAST_DAY = '2100-12-31';

export type SummaryRangeError = { field: 'from' | 'to'; message: string };

/**
 * Qué le falta al periodo, o `null` si vale. El error va al campo que hay que
 * corregir: «Hasta» si es anterior a «Desde» o si el periodo es demasiado largo.
 */
export function summaryRangeError(from: string | null, to: string | null): SummaryRangeError | null {
  const start = isoToCalendarDate(from);
  const end = isoToCalendarDate(to);
  if (!start) return { field: 'from', message: summaryRangeCopy.missing };
  if (!end) return { field: 'to', message: summaryRangeCopy.missing };
  if (from! < FIRST_DAY || from! > LAST_DAY) return { field: 'from', message: summaryRangeCopy.outOfBounds };
  if (to! < FIRST_DAY || to! > LAST_DAY) return { field: 'to', message: summaryRangeCopy.outOfBounds };
  if (start.compare(end) > 0) return { field: 'to', message: summaryRangeCopy.fromAfterTo };
  if (end.compare(start) + 1 > MAX_SUMMARY_DAYS) return { field: 'to', message: summaryRangeCopy.tooLong };
  return null;
}

function range(from: CalendarDate, to: CalendarDate): IsoRange {
  return { from: from.toString(), to: to.toString() };
}

export type SummaryPresetId = 'thisMonth' | 'previousMonth' | 'thisYear';

/** Los atajos del diálogo, contados desde «hoy» en la zona de la sede. */
export const SUMMARY_PRESETS: readonly { id: SummaryPresetId; label: string; range: (today: CalendarDate) => IsoRange }[] = [
  { id: 'thisMonth', label: 'Este mes', range: (t) => range(startOfMonth(t), t) },
  {
    id: 'previousMonth',
    label: 'Mes anterior',
    range: (t) => {
      const previous = startOfMonth(t).subtract({ months: 1 });
      return range(previous, endOfMonth(previous));
    },
  },
  { id: 'thisYear', label: 'Este año', range: (t) => range(startOfYear(t), t) },
];

/** El periodo por defecto: del día 1 del mes de la sede hasta hoy. */
export function defaultSummaryRange(today: CalendarDate): IsoRange {
  return SUMMARY_PRESETS[0].range(today);
}

/** El atajo que coincide con el periodo elegido, para marcarlo. */
export function activeSummaryPreset(value: IsoRange, today: CalendarDate): SummaryPresetId | null {
  const hit = SUMMARY_PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === value.from && r.to === value.to;
  });
  return hit?.id ?? null;
}

import {
  CalendarDate,
  Time,
  endOfMonth,
  getLocalTimeZone,
  parseDate,
  startOfMonth,
  today as todayIn,
} from '@internationalized/date';

/**
 * Puente entre el contrato de las pantallas (ISO en texto: 'YYYY-MM-DD' para
 * un día civil, 'HH:mm' para una hora de reloj) y los valores de
 * `@internationalized/date` que usan las primitivas de `react-aria-components`.
 * Ninguna pantalla ve un `CalendarDate`: entra ISO y sale ISO (DESIGN.md →
 * Dates and times).
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** 'YYYY-MM-DD' → `CalendarDate`; `null` si falta o no es un día que exista. */
export function isoToCalendarDate(iso: string | null | undefined): CalendarDate | null {
  if (!iso) return null;
  const match = ISO_DAY.exec(iso);
  if (!match) return null;
  try {
    const date = parseDate(iso);
    // `parseDate` recorta 2026-02-31 al 28: un día que no existe no es un valor.
    return date.toString() === iso ? date : null;
  } catch {
    return null;
  }
}

/** `CalendarDate` (o cualquier fecha con año/mes/día) → 'YYYY-MM-DD'. */
export function calendarDateToIso(date: { year: number; month: number; day: number } | null | undefined): string | null {
  if (!date) return null;
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

/** 'HH:mm' (o 'HH:mm:ss') → `Time`; `null` si falta o no es una hora válida. */
export function isoToTime(iso: string | null | undefined): Time | null {
  if (!iso) return null;
  const match = ISO_TIME.exec(iso);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return new Time(hour, minute);
}

/** `Time` → 'HH:mm' (24 h; el reloj de 12 h es solo de pantalla). */
export function timeToIso(time: { hour: number; minute: number } | null | undefined): string | null {
  if (!time) return null;
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/**
 * «Hoy» como `CalendarDate` en la zona de la sede; sin zona (o con una que el
 * navegador no conoce), en la del navegador.
 */
export function todayDate(timeZone?: string | null): CalendarDate {
  if (timeZone) {
    try {
      return todayIn(timeZone);
    } catch {
      // Zona desconocida: la del navegador antes que romper el campo.
    }
  }
  return todayIn(getLocalTimeZone());
}

/** Un periodo con días civiles ISO, ambos incluidos. */
export interface IsoRange {
  from: string;
  to: string;
}

export type DateRangePresetId = 'today' | 'last7Days' | 'thisMonth' | 'previousMonth';

export interface DateRangePreset {
  id: string;
  label: string;
  /** El periodo que aplica, contado desde «hoy» en la zona de la sede. */
  range: (today: CalendarDate) => IsoRange;
}

function range(from: CalendarDate, to: CalendarDate): IsoRange {
  return { from: from.toString(), to: to.toString() };
}

/**
 * Atajos de periodo de los filtros: Hoy, Últimos 7 días (hoy incluido), Este
 * mes (del 1 a hoy: lo que ya pasó) y Mes anterior (completo).
 */
export const DEFAULT_RANGE_PRESETS: readonly DateRangePreset[] = [
  { id: 'today', label: 'Hoy', range: (t) => range(t, t) },
  { id: 'last7Days', label: 'Últimos 7 días', range: (t) => range(t.subtract({ days: 6 }), t) },
  { id: 'thisMonth', label: 'Este mes', range: (t) => range(startOfMonth(t), t) },
  {
    id: 'previousMonth',
    label: 'Mes anterior',
    range: (t) => {
      const previous = startOfMonth(t).subtract({ months: 1 });
      return range(previous, endOfMonth(previous));
    },
  },
];

/**
 * Locale para `Intl`/react-aria a partir del de la sede: sin extensiones
 * `-u-` (calendario, dígitos y reloj no los decide el locale, ver
 * `regional-format.ts`) y `es` si falta o no es válido.
 */
export function normalizeDateLocale(locale: string | null | undefined): string {
  if (!locale) return 'es';
  try {
    return new Intl.Locale(locale).baseName;
  } catch {
    return 'es';
  }
}

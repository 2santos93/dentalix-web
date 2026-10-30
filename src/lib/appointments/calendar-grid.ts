import { civilDateLabel } from '@/lib/format/date';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { civilNoonUtc } from '@/lib/time/civil-day';
import { addCivilDays, civilWeekStart, wallDayRange } from '@/lib/time/wall-clock';

/**
 * A single cell of the month calendar grid: its civil `YYYY-MM-DD` date and
 * whether it belongs to the month being displayed (leading/trailing days from
 * the adjacent months fill the 6×7 grid and render muted).
 */
export interface MonthGridDay {
  date: string;
  inMonth: boolean;
}

/**
 * The 42 days (6 weeks × 7, Monday-first) of the calendar grid for the month
 * containing `date`. Civil days with no zone (DX-378): the grid is the same in
 * any browser. Weeks run Monday..Sunday (ISO-8601), like `civilWeekStart`.
 */
export function monthGridDays(date: string): MonthGridDay[] {
  const month = date.slice(0, 7);
  const gridStart = civilWeekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => {
    const day = addCivilDays(gridStart, i);
    return { date: day, inMonth: day.startsWith(month) };
  });
}

/**
 * The `{ from, to }` UTC-ISO range covering the whole visible grid (first
 * Monday 00:00 .. last Sunday end-of-day) in the sede zone — so a single
 * `GET /appointments?from&to` fetch backs every cell.
 */
export function monthGridRange(date: string, timeZone: string): { from: string; to: string } {
  const days = monthGridDays(date);
  return {
    from: wallDayRange(days[0].date, timeZone).from,
    to: wallDayRange(days[days.length - 1].date, timeZone).to,
  };
}

/** `date` shifted by `delta` whole months, clamped to a valid day, as a civil `YYYY-MM-DD` (for the ‹ › month navigation). */
export function addMonths(date: string, delta: number): string {
  const d = civilNoonUtc(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 12));
  // Clamp the day to the target month's length (e.g. Jan 31 + 1 month → Feb 28/29).
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

/** Month + year label for the calendar header, e.g. "marzo de 2026". */
export function monthLabel(date: string): string {
  return civilDateLabel(date, { month: 'long', year: 'numeric' });
}

/**
 * Encabezado de un día de la semana: «lun 09/03» (es-VE) o «lun 03/09»
 * (en-US). La palabra, en el idioma del producto; el día y el mes, en el
 * orden del locale de la sede.
 */
export function weekDayHeader(day: string, fmt: RegionalFormat): string {
  return `${civilDateLabel(day, { weekday: 'short' })} ${fmt.dayMonth(civilNoonUtc(day), 'UTC')}`;
}

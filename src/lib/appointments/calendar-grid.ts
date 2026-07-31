import { localDayRange } from './day-range';

/**
 * A single cell of the month calendar grid: its local `YYYY-MM-DD` date and
 * whether it belongs to the month being displayed (leading/trailing days from
 * the adjacent months fill the 6×7 grid and render muted).
 */
export interface MonthGridDay {
  date: string;
  inMonth: boolean;
}

/** Local `YYYY-MM-DD` for a `Date`, using its LOCAL calendar fields (never UTC-shifted). */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The 42 days (6 weeks × 7, Monday-first) of the calendar grid for the month
 * containing `date`. Leading days come from the previous month and trailing
 * days from the next, so the grid is always a full rectangle — the classic
 * month-calendar layout. Weeks run Monday..Sunday (ISO-8601), consistent with
 * `localWeekRange` in `day-range.ts`.
 */
export function monthGridDays(date: string): MonthGridDay[] {
  // Parsed as local midnight (same convention as `localDayRange`) so weekday
  // math reads the LOCAL calendar, not a UTC-shifted one.
  const d = new Date(`${date}T00:00:00`);
  const month = d.getMonth();
  const first = new Date(d.getFullYear(), month, 1);

  // Monday-first offset: how many days back from the 1st to reach that week's
  // Monday. `getDay()`: 0 = Sunday..6 = Saturday; Sunday sits 6 days after its
  // Monday, every other day is `getDay() - 1`.
  const dow = first.getDay();
  const daysBackToMonday = dow === 0 ? 6 : dow - 1;

  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - daysBackToMonday);

  const days: MonthGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    days.push({ date: toLocalDateString(cur), inMonth: cur.getMonth() === month });
  }
  return days;
}

/**
 * The `{ from, to }` UTC-ISO range covering the whole visible grid (first
 * Monday .. last Sunday, inclusive-end-of-day) for `date`'s month — so a
 * single `GET /appointments?from&to` fetch backs every cell, including the
 * leading/trailing adjacent-month days the grid shows.
 */
export function monthGridRange(date: string): { from: string; to: string } {
  const days = monthGridDays(date);
  return {
    from: localDayRange(days[0].date).from,
    to: localDayRange(days[days.length - 1].date).to,
  };
}

/** `date` shifted by `delta` whole months, clamped to a valid day, as a local `YYYY-MM-DD` (for the ‹ › month navigation). */
export function addMonths(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  const targetMonthFirst = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  // Clamp the day to the target month's length (e.g. Jan 31 + 1 month → Feb 28/29).
  const lastDay = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth() + 1, 0).getDate();
  targetMonthFirst.setDate(Math.min(d.getDate(), lastDay));
  return toLocalDateString(targetMonthFirst);
}

/** Human month + year label for the calendar header, e.g. "marzo 2026" (es). */
export function monthLabel(date: string, locale = 'es'): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

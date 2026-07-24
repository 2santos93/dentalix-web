/**
 * Adds one calendar day to a `YYYY-MM-DD` date string, returning the result
 * in the same format.
 *
 * `DashboardView`'s "Hasta" date picker is inclusive from the user's
 * perspective (they expect sales made ON that day to be included), but the
 * backend's sales-totals query is half-open `[from, to)` — so the raw
 * selected date would silently exclude that day's sales. Extending the
 * upper bound by one day before it's sent to `getDashboard` closes that gap
 * while the input itself keeps showing the user's selected (inclusive) date.
 *
 * Parses the `YYYY-MM-DD` parts and adds the day via `Date.UTC` rather than
 * doing arithmetic on `new Date(dateStr)` directly — `Date.UTC` normalizes
 * an out-of-range day (e.g. day 32) into the correct next month/year on its
 * own, and reading back with the UTC getters avoids any local-timezone
 * shift that a naive local-time round-trip could introduce.
 */
export function addOneDayIso(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

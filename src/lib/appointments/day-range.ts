/**
 * Local-day boundaries (`from` inclusive, `to` inclusive-end-of-day) as UTC
 * ISO instants for `GET /appointments?from&to`. Extracted from `AgendaView`
 * (originally `agenda/page.tsx`) so it's unit-testable on its own — same
 * convention as `projectOdontogram` living in `src/lib/odontogram/projection.ts`
 * rather than inline in the component that uses it.
 */
export function localDayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00`).toISOString(),
    to: new Date(`${date}T23:59:59.999`).toISOString(),
  };
}

/**
 * Local-week boundaries (Monday 00:00:00 .. Sunday 23:59:59.999, LOCAL) as
 * UTC ISO instants for `GET /appointments?from&to`, for the week containing
 * `date`. Weeks run Monday..Sunday (ISO-8601 convention) — a Sunday belongs
 * to the week ending that same day, not the one starting it. Delegates to
 * `localDayRange` for the actual endpoint math so the two stay byte-for-byte
 * consistent with the day view's boundaries.
 */
export function localWeekRange(date: string): { from: string; to: string } {
  // Parsed as local midnight (same convention as `localDayRange`) so
  // `getDay()` reads the LOCAL weekday, not a UTC-shifted one.
  const d = new Date(`${date}T00:00:00`);
  // `getDay()`: 0 = Sunday .. 6 = Saturday. Distance back to Monday: Sunday
  // is 6 days after the preceding Monday; every other day is `getDay() - 1`.
  const dayOfWeek = d.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(d);
  monday.setDate(monday.getDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const toDateString = (dt: Date): string =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  return {
    from: localDayRange(toDateString(monday)).from,
    to: localDayRange(toDateString(sunday)).to,
  };
}

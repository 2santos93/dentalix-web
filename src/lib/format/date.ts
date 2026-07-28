/**
 * Central date/time display helpers. Every user-facing date renders as
 * `dd/mm/yyyy` (zero-padded) and every time as 24h `HH:mm`, deterministically —
 * we compose the parts by hand instead of relying on `toLocaleDateString`'s
 * locale-default ordering, which is neither guaranteed zero-padded nor
 * guaranteed day-first across browsers/OSes.
 *
 * Timezone convention (see the two variants below): the database always stores
 * UTC. Genuine instants (appointment times, server timestamps) are shown in the
 * user's local timezone; civil dates (a birthday, the day a payment was made)
 * are shown exactly as they were picked.
 */

const FALLBACK = '—';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A **civil (calendar) date** — a day with no meaningful time-of-day, e.g. a
 * birth date or the date a payment was recorded. These are stored as UTC
 * midnight (a `type="date"` value round-tripped through `new Date(str)`), so we
 * read the UTC parts: that renders the day the user actually picked, free of
 * the off-by-one a local-timezone conversion would introduce west of UTC.
 */
export function formatCivilDate(
  value: string | number | Date | null | undefined,
  fallback: string = FALLBACK,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * The date of a **genuine instant** (a server timestamp such as `createdAt` /
 * `recordedAt`, or "now"), rendered `dd/mm/yyyy` in the user's local timezone.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  fallback: string = FALLBACK,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * The time-of-day of a genuine instant, rendered 24h `HH:mm` in the user's
 * local timezone.
 */
export function formatTime(
  value: string | number | Date | null | undefined,
  fallback: string = FALLBACK,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

/** `dd/mm/yyyy HH:mm` for a genuine instant, in the user's local timezone. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback: string = FALLBACK,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  return `${formatDate(d)} ${formatTime(d)}`;
}

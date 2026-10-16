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

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** Partes de calendario de `d` en `timeZone`; `null` si la zona no existe. */
function zonedParts(d: Date, timeZone: string): Record<string, number> | null {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return null;
    }
    zoneFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(d)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/**
 * `dd/mm/yyyy HH:mm` for a genuine instant in a given IANA zone — e.g. an
 * audit event shown in its location's zone (DX-009), so every viewer reads the
 * same wall-clock time the clinic saw. An unknown zone falls back to the
 * browser's local time rather than breaking the row.
 */
export function formatDateTimeInZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
  fallback: string = FALLBACK,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const p = zonedParts(d, timeZone);
  if (!p) return formatDateTime(d, fallback);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The UTC instant (ISO) at which the civil day `YYYY-MM-DD` starts in
 * `timeZone` — to turn a date-picker day into the API's `from`/`to` instants
 * in the clinic's zone instead of the browser's. `null` for a malformed day.
 */
export function zonedDayStart(day: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const guess = Date.UTC(y, m - 1, d);
  const check = new Date(guess);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  // Offset of the zone at that moment: (wall clock read as UTC) − instant.
  const offsetAt = (instant: number): number => {
    const p = zonedParts(new Date(instant), timeZone);
    if (!p) return 0;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
  };
  // Two passes settle a DST change between the guess and the real instant.
  let instant = guess - offsetAt(guess);
  instant = guess - offsetAt(instant);
  return new Date(instant).toISOString();
}

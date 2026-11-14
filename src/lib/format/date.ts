/**
 * Neutral date helpers: calendar logic only, nothing that PAINTS a date or a
 * time. Every date, time and amount a screen shows goes through the sede of the
 * data (`RegionalFormat` / `SedeClock` / `useSedeStamp`): its zone, its locale
 * and its 12/24 h clock, never the browser's and never a hand-composed
 * `dd/mm/yyyy` or `HH:mm` (DX-378, DX-354b).
 *
 * What stays here is pure logic: `civilDateInZone` (which day an instant is in a
 * zone), `zonedDayStart` (the instant a civil day starts in a zone),
 * `civilDateLabel` (a civil day in words of the product language), `firstOfMonth`
 * and `zoneCityLabel`. The sede-less painters (`formatDate`, `formatTime`,
 * `formatDateTime`, `formatTimeInZone`, `formatDateTimeInZone`, `formatDateLabel`
 * and `formatCivilDate`) were retired in DX-354b; `src/architecture/sede-clock-guard`
 * fails if they come back.
 *
 * Timezone convention: the database always stores UTC. A genuine instant is read
 * in the zone of its sede; a civil date (a birthday, the day a payment was made)
 * is a `YYYY-MM-DD` day with no zone at all.
 */

import { UI_LANGUAGE } from '@/lib/format/regional-format';
import { civilNoonUtc } from '@/lib/time/civil-day';
import { zoneCityName } from '@/lib/format/zone';

const FALLBACK = '—';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

/**
 * Nombre legible de una zona IANA para rótulos (DX-097): «Ciudad de México» para
 * `America/Mexico_City`, «Caracas» para `America/Caracas`; en las demás, la ciudad
 * del id (`zoneCityName`).
 */
export function zoneCityLabel(timeZone: string): string {
  return zoneCityName(timeZone);
}

/** Partes con palabras de un día civil: nunca un mes en cifras (su orden lo decide el locale de la sede). */
export interface CivilLabelOptions {
  weekday?: 'long' | 'short';
  day?: 'numeric';
  month?: 'long' | 'short';
  year?: 'numeric';
}

/**
 * Un día civil `YYYY-MM-DD` en palabras del idioma del producto («domingo, 15
 * de marzo», «marzo de 2026»), sin ninguna zona: ni la del navegador ni la de
 * la sede (DX-378). Para un instante, primero su día en la zona de la sede
 * (`wallDay`). Un día que no existe da `fallback`.
 */
export function civilDateLabel(day: string, options: CivilLabelOptions, fallback: string = FALLBACK): string {
  let noon: Date;
  try {
    noon = civilNoonUtc(day);
  } catch {
    return fallback;
  }
  let formatter = civilLabelFormatters.get(JSON.stringify(options));
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(UI_LANGUAGE, {
      ...options,
      timeZone: 'UTC',
      calendar: 'gregory',
      numberingSystem: 'latn',
    });
    civilLabelFormatters.set(JSON.stringify(options), formatter);
  }
  return formatter.format(noon);
}

const civilLabelFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * El día civil (`YYYY-MM-DD`) de un instante en una zona IANA — p. ej. qué día
 * es «hoy» en la sede (DX-097). `null` si el instante o la zona no son válidos.
 */
export function civilDateInZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
): string | null {
  const d = toDate(value);
  if (!d) return null;
  const p = zonedParts(d, timeZone);
  if (!p) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(p.year).padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}`;
}

/** Primer día del mes de `day` (`YYYY-MM-DD`): el «desde» por defecto de un periodo. */
export function firstOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}

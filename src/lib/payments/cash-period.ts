import { DEFAULT_SEDE_TIME_ZONE, civilDateInZone } from '@/lib/format/date';

/**
 * Períodos de la caja. La API recibe días civiles (`YYYY-MM-DD`, ambos
 * inclusive) y los corta a medianoche de la zona de CADA sede (DX-097), así
 * que aquí tampoco se habla de instantes: "hoy" es el día civil de la SEDE —no
 * el del navegador, que puede estar en otra zona—.
 */

export type CashPreset = 'today' | 'week' | 'month';

export interface CashRange {
  from: string;
  to: string;
}

// Mismo tope que la API (MAX_RANGE_DAYS en ListCashPaymentsUseCase): se valida
// aquí también para no mandar una petición que se sabe que va a dar 400.
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `Date.UTC` como `YYYY-MM-DD` (normaliza día 0, 32…). */
function utcCivil(year: number, monthIndex: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * El rango de un atajo, relativo al día civil de `now` en `timeZone` (la zona
 * de la sede). La semana va de lunes a domingo —la semana laboral en LATAM—,
 * también cuando hoy es domingo.
 */
export function presetRange(preset: CashPreset, timeZone: string, now: Date = new Date()): CashRange {
  const today = civilDateInZone(now, timeZone) ?? civilDateInZone(now, DEFAULT_SEDE_TIME_ZONE)!;
  if (preset === 'today') return { from: today, to: today };
  const [y, m, d] = today.split('-').map(Number);
  if (preset === 'week') {
    // getUTCDay(): 0 = domingo. Días desde el lunes: lunes 0 … domingo 6.
    const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    return {
      from: utcCivil(y, m - 1, d - sinceMonday),
      to: utcCivil(y, m - 1, d - sinceMonday + 6),
    };
  }
  // Día 0 del mes siguiente = último día de este.
  return { from: utcCivil(y, m - 1, 1), to: utcCivil(y, m, 0) };
}

/** Rango que la API aceptará: dos días, `from <= to`, como mucho 366 días. */
export function isValidRange({ from, to }: CashRange): boolean {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(from) || !pattern.test(to)) return false;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return false;
  return Math.round((end - start) / DAY_MS) + 1 <= MAX_RANGE_DAYS;
}

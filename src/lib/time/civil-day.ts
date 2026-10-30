/**
 * Días civiles 'YYYY-MM-DD' sin zona (DX-316), como `src/shared/time/civil-day.ts`
 * de la API. Un día civil es una fecha de calendario, no un instante: nada aquí
 * depende de la zona del proceso ni del navegador.
 */

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Mediodía UTC del día civil `day`: con `timeZone: 'UTC'` sus palabras no
 * dependen de la zona del proceso ni del navegador. RangeError si el día no
 * existe (`2027-02-30` no: `Date.UTC` lo llevaría en silencio al 2 de marzo).
 */
export function civilNoonUtc(day: string): Date {
  const match = CIVIL_DATE_RE.exec(day);
  const instant = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 12)) : undefined;
  if (!instant || instant.toISOString().slice(0, 10) !== day) {
    throw new RangeError(`Día civil no válido: ${day}`);
  }
  return instant;
}

/** Día de la semana del día civil `day` (0 = domingo … 6 = sábado). RangeError si no existe. */
export function civilWeekday(day: string): number {
  return civilNoonUtc(day).getUTCDay();
}

/** `true` si `day` es un día civil `YYYY-MM-DD` que existe (un `<input type="date">` vacío no lo es). */
export function isCivilDay(day: string): boolean {
  try {
    civilNoonUtc(day);
    return true;
  } catch {
    return false;
  }
}

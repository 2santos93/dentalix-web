import { wallParts } from '@/lib/format/regional-format';
import { civilNoonUtc, civilWeekday } from './civil-day';

/**
 * Reloj de pared de una sede (DX-378): qué día y qué minuto marca el reloj de
 * la sede en un instante, y qué instante corresponde a un minuto de un día
 * civil en su zona. Es lógica (la rejilla de la agenda, los rangos que se
 * piden a la API, la hora que se elige en un formulario), nunca presentación:
 * para pintar está `RegionalFormat`. Nada aquí lee la zona del navegador.
 */

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;

function toDate(instant: Date | string): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

/** Minutos de pared desde las 00:00 (0–1439) del instante en `timeZone`. */
export function wallMinuteOfDay(instant: Date | string, timeZone: string): number {
  const p = wallParts(toDate(instant), timeZone);
  return p.hour * 60 + p.minute;
}

/** Día civil `YYYY-MM-DD` del instante en `timeZone`. */
export function wallDay(instant: Date | string, timeZone: string): string {
  const p = wallParts(toDate(instant), timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** `day` desplazado `n` días civiles (sin zona). RangeError si `day` no existe. */
export function addCivilDays(day: string, n: number): string {
  const noon = civilNoonUtc(day);
  return new Date(noon.getTime() + n * 24 * 60 * MS_PER_MINUTE).toISOString().slice(0, 10);
}

/** El lunes de la semana (ISO 8601) del día civil `day`: el domingo cierra su semana. */
export function civilWeekStart(day: string): string {
  const weekday = civilWeekday(day);
  return addCivilDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * Desfase de `timeZone` respecto de UTC en ese instante, en minutos (Bogotá
 * −300, Berlín +60 o +120 según el horario de verano): el reloj de pared leído
 * como UTC menos el instante, sin sus segundos.
 */
export function zoneOffsetMinutes(instant: Date | string, timeZone: string): number {
  const ms = toDate(instant).getTime();
  const p = wallParts(new Date(ms), timeZone);
  const floored = ms - (((ms % MS_PER_MINUTE) + MS_PER_MINUTE) % MS_PER_MINUTE);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - floored) / MS_PER_MINUTE;
}

/**
 * Instante en que el reloj de `timeZone` marca el minuto `minute` (0–1440;
 * 1440 = las 00:00 del día siguiente) del día civil `day`. Con un cambio de
 * horario, la misma regla que `Temporal` (`disambiguation: 'compatible'`):
 *
 * - Hora repetida (se atrasa el reloj): la primera vez que el reloj la marca.
 * - Hora que no existe (se adelanta el reloj): se corre hacia delante tanto
 *   como el salto (02:30 en Nueva York el día del cambio → 03:30). Así una
 *   medianoche que no existe (Santiago de Chile, Beirut) da la primera hora
 *   del día y nunca la última del anterior.
 *
 * Supone a lo sumo un cambio de horario en las 24 h de cada lado, como
 * cualquier zona IANA actual.
 */
export function wallInstant(day: string, minute: number, timeZone: string): Date {
  if (!Number.isInteger(minute) || minute < 0 || minute > MINUTES_PER_DAY) {
    throw new RangeError(`Minuto del día fuera de rango: ${minute}`);
  }
  const noon = civilNoonUtc(day);
  // El minuto leído como si la zona fuera UTC.
  const asUtc = Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate(), 0, minute);
  const offsetAt = (instant: number): number => zoneOffsetMinutes(new Date(instant), timeZone) * MS_PER_MINUTE;
  const DAY_MS = MINUTES_PER_DAY * MS_PER_MINUTE;
  const before = offsetAt(asUtc - DAY_MS);
  const after = offsetAt(asUtc + DAY_MS);
  // Los instantes en que el reloj marca de verdad ese minuto (0, 1 o 2).
  const matches = [...new Set([before, after])]
    .map((offset) => asUtc - offset)
    .filter((instant) => offsetAt(instant) === asUtc - instant)
    .sort((a, b) => a - b);
  // Sin ninguno, el minuto cae en el salto: con el desfase de antes del cambio.
  return new Date(matches[0] ?? asUtc - before);
}

/** El día civil `day` en `timeZone` como instantes ISO: de su medianoche a justo antes de la siguiente. */
export function wallDayRange(day: string, timeZone: string): { from: string; to: string } {
  return {
    from: wallInstant(day, 0, timeZone).toISOString(),
    to: new Date(wallInstant(day, MINUTES_PER_DAY, timeZone).getTime() - 1).toISOString(),
  };
}

/** La semana (lunes a domingo) del día civil `day` en `timeZone`, como instantes ISO. */
export function wallWeekRange(day: string, timeZone: string): { from: string; to: string } {
  const monday = civilWeekStart(day);
  return {
    from: wallDayRange(monday, timeZone).from,
    to: wallDayRange(addCivilDays(monday, 6), timeZone).to,
  };
}

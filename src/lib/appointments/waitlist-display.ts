import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { civilNoonUtc } from '@/lib/time/civil-day';
import { wallDay } from '@/lib/time/wall-clock';

/** Texto de la cola de pendientes (DX-122), en el reloj de la sede (DX-378). Puro. */

/** «Desde hoy» / «Hace 3 días»: cuánto lleva esperando (días de calendario de la sede). */
export function waitingLabel(createdAt: string, timeZone: string, now: Date = new Date()): string {
  const days = Math.round(
    (civilNoonUtc(wallDay(now, timeZone)).getTime() - civilNoonUtc(wallDay(createdAt, timeZone)).getTime()) /
      86_400_000,
  );
  if (days <= 0) return 'Desde hoy';
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

/**
 * «Canceló la cita del 3 mar 10:00» / «No asistió…» / «Alta manual». La fecha
 * y la hora, con el reloj de la sede de esa cita; sin él, «—».
 */
export function waitlistOriginLabel(
  entry: { sourceAppointment: { start: string; status: string } | null },
  clock: SedeClock | null,
): string {
  const source = entry.sourceAppointment;
  if (!source) return 'Alta manual';
  const when = clock
    ? `${civilDateLabel(wallDay(source.start, clock.timeZone), { day: 'numeric', month: 'short' })} ${sedeTime(source.start, clock)}`
    : NO_SEDE_FORMAT;
  return source.status === 'NO_SHOW'
    ? `No asistió a la cita del ${when}`
    : `Canceló la cita del ${when}`;
}

export interface OpeningsDay<T extends { start: string }> {
  /** `YYYY-MM-DD` en la zona de la sede. */
  day: string;
  openings: T[];
}

/** Huecos agrupados por día de la sede (la API ya los da en orden). */
export function groupOpeningsByDay<T extends { start: string }>(openings: T[], timeZone: string): OpeningsDay<T>[] {
  const groups: OpeningsDay<T>[] = [];
  for (const opening of openings) {
    const day = wallDay(opening.start, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.openings.push(opening);
    else groups.push({ day, openings: [opening] });
  }
  return groups;
}

import { formatDateLabel } from '@/lib/format/date';

/** Texto de la cola de pendientes (DX-122). Puro, en hora local. */

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** «Desde hoy» / «Hace 3 días»: cuánto lleva esperando (días de calendario). */
export function waitingLabel(createdAt: string, now: Date = new Date()): string {
  const days = Math.round(
    (new Date(`${localDay(now)}T00:00:00`).getTime() -
      new Date(`${localDay(new Date(createdAt))}T00:00:00`).getTime()) /
      86_400_000,
  );
  if (days <= 0) return 'Desde hoy';
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

/** «Canceló la cita del 3 mar 10:00» / «No asistió…» / «Alta manual». */
export function waitlistOriginLabel(entry: {
  sourceAppointment: { start: string; status: string } | null;
}): string {
  const source = entry.sourceAppointment;
  if (!source) return 'Alta manual';
  const start = new Date(source.start);
  const when = `${formatDateLabel(start, { day: 'numeric', month: 'short' })} ${hhmm(start)}`;
  return source.status === 'NO_SHOW'
    ? `No asistió a la cita del ${when}`
    : `Canceló la cita del ${when}`;
}

export interface OpeningsDay<T extends { start: string }> {
  /** `YYYY-MM-DD` local. */
  day: string;
  openings: T[];
}

/** Huecos agrupados por día local (la API ya los da en orden). */
export function groupOpeningsByDay<T extends { start: string }>(openings: T[]): OpeningsDay<T>[] {
  const groups: OpeningsDay<T>[] = [];
  for (const opening of openings) {
    const day = localDay(new Date(opening.start));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.openings.push(opening);
    else groups.push({ day, openings: [opening] });
  }
  return groups;
}

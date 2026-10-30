import { wallInstant, wallMinuteOfDay } from '@/lib/time/wall-clock';

/**
 * Bloqueos de agenda en la web (DX-122): etiquetas, qué columna pinta cada
 * bloqueo y su banda en un día. Puro: lo prueban los tests sin DOM.
 *
 * Mismo alcance que la API (`blockAffects`): un bloqueo con profesional es
 * suyo en su sede o, sin sede, en todas; uno sin profesional es de toda la sede.
 */

export type ScheduleBlockKind = 'VACATION' | 'MEETING' | 'LUNCH' | 'OTHER';

/** Lo que la pintura necesita de un bloqueo (el DTO de la API lo cumple). */
export interface ScheduleBlockLike {
  id: string;
  providerId: string | null;
  locationId: string | null;
  start: string;
  end: string;
  kind: ScheduleBlockKind;
  allowsBooking: boolean;
  note: string | null;
}

export const SCHEDULE_BLOCK_KIND_LABELS: Record<ScheduleBlockKind, string> = {
  VACATION: 'Vacaciones',
  MEETING: 'Reunión',
  LUNCH: 'Almuerzo',
  OTHER: 'Bloqueo',
};

export const SCHEDULE_BLOCK_KINDS: ScheduleBlockKind[] = ['VACATION', 'MEETING', 'LUNCH', 'OTHER'];

/**
 * ¿Se pinta en la columna de `providerId`? `activeLocationId` null = vista
 * consolidada («Todas las sedes»): se pinta todo lo que le toca.
 */
export function blockShownInColumn(
  block: Pick<ScheduleBlockLike, 'providerId' | 'locationId'>,
  providerId: string,
  activeLocationId: string | null,
): boolean {
  const inLocation =
    activeLocationId === null || block.locationId === null || block.locationId === activeLocationId;
  if (block.providerId === null) return inLocation;
  return block.providerId === providerId && inLocation;
}

/**
 * Tramo `[start, end)` (minutos desde las 00:00 de `day` en el reloj de la
 * sede, `timeZone`) que el bloqueo ocupa ese día, recortado a la franja
 * visible; `null` si no se ve.
 */
export function blockBandForDay(
  block: Pick<ScheduleBlockLike, 'start' | 'end'>,
  day: string,
  window: { start: number; end: number },
  timeZone: string,
): { start: number; end: number } | null {
  const dayStart = wallInstant(day, 0, timeZone).getTime();
  const dayEnd = wallInstant(day, 24 * 60, timeZone).getTime();
  const toMinute = (iso: string) => {
    const ms = new Date(iso).getTime();
    if (ms <= dayStart) return 0;
    if (ms >= dayEnd) return 24 * 60;
    return wallMinuteOfDay(iso, timeZone);
  };
  const start = Math.max(toMinute(block.start), window.start);
  const end = Math.min(toMinute(block.end), window.end);
  return end > start ? { start, end } : null;
}

/** «Vacaciones: Congreso · Dra. Ana» / «Almuerzo · se puede agendar». */
export function blockLabel(block: ScheduleBlockLike, providerName?: string): string {
  const kind = SCHEDULE_BLOCK_KIND_LABELS[block.kind];
  const head = block.note ? `${kind}: ${block.note}` : kind;
  const who = block.providerId === null ? 'toda la sede' : providerName;
  return [head, who, block.allowsBooking ? 'se puede agendar' : null]
    .filter(Boolean)
    .join(' · ');
}

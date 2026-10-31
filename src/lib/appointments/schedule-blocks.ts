import { wallInstant, wallMinuteOfDay } from '@/lib/time/wall-clock';
import { minutesToTime } from '@/lib/locations/schedule-api';

/**
 * Bloqueos de agenda en la web (DX-122): etiquetas, qué columna pinta cada
 * bloqueo y su banda en un día. Puro: lo prueban los tests sin DOM.
 *
 * Mismo alcance que la API (`blockAffects`): un bloqueo con profesional es
 * suyo en su sede o, sin sede, en todas; uno sin profesional es de toda la sede.
 */

export type ScheduleBlockKind = 'VACATION' | 'MEETING' | 'LUNCH' | 'OTHER' | 'RESERVED';

/** DX-446: un tipo de cita para el que está reservado un hueco. */
export interface ReservedTypeLike {
  id: string;
  name: string;
  color: string;
  isUrgent: boolean;
}

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
  /** DX-446: tipos permitidos de un `RESERVED` (los trae el listado). */
  reservedForTypes?: ReservedTypeLike[];
  /** DX-446: «Liberar a partir de», minutos de pared de la sede. */
  releaseAtMinute?: number | null;
  /** DX-446: ya pasó la liberación (reloj del servidor). */
  released?: boolean;
}

export const SCHEDULE_BLOCK_KIND_LABELS: Record<ScheduleBlockKind, string> = {
  VACATION: 'Vacaciones',
  MEETING: 'Reunión',
  LUNCH: 'Almuerzo',
  OTHER: 'Bloqueo',
  RESERVED: 'Reservado',
};

export const SCHEDULE_BLOCK_KINDS: ScheduleBlockKind[] = ['VACATION', 'MEETING', 'LUNCH', 'OTHER', 'RESERVED'];

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

/**
 * DX-446: lo que dice un hueco reservado: «Urgencias» si todos sus tipos son
 * de urgencia; si no, sus nombres.
 */
function reservedTypesLabel(types: readonly ReservedTypeLike[]): string {
  if (types.length > 0 && types.every((t) => t.isUrgent)) return 'Urgencias';
  return types.map((t) => t.name).join(', ') || SCHEDULE_BLOCK_KIND_LABELS.RESERVED;
}

/** DX-446: el color de un hueco reservado (el de su primer tipo), o null. */
export function reservedBlockColor(block: ScheduleBlockLike): string | null {
  if (block.kind !== 'RESERVED') return null;
  return block.reservedForTypes?.[0]?.color ?? null;
}

/**
 * «Vacaciones: Congreso · Dra. Ana» / «Almuerzo · se puede agendar».
 * DX-446: «Urgencias · reservado» o, ya liberado, «Urgencias · Libre desde
 * 11:00» (`formatMinute` pinta la hora con el reloj de la sede).
 */
export function blockLabel(
  block: ScheduleBlockLike,
  providerName?: string,
  formatMinute: (minute: number) => string = minutesToTime,
): string {
  const who = block.providerId === null ? 'toda la sede' : providerName;
  if (block.kind === 'RESERVED') {
    const head = block.note || reservedTypesLabel(block.reservedForTypes ?? []);
    const state =
      block.released && block.releaseAtMinute != null
        ? `Libre desde ${formatMinute(block.releaseAtMinute)}`
        : 'reservado';
    return [head, who, state].filter(Boolean).join(' · ');
  }
  const kind = SCHEDULE_BLOCK_KIND_LABELS[block.kind];
  const head = block.note ? `${kind}: ${block.note}` : kind;
  return [head, who, block.allowsBooking ? 'se puede agendar' : null]
    .filter(Boolean)
    .join(' · ');
}

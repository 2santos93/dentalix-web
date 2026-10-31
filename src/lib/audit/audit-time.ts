import type { AuditEvent } from './audit-api';
import type { LocationNames } from './audit-labels';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import type { AgendaClock, SedeClock } from '@/lib/locations/sede-clock';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { utcOffsetLabel } from '@/lib/format/zone';
import { zoneOffsetMinutes } from '@/lib/time/wall-clock';

/** Una hora con la zona en la que va. */
export interface AuditInstant {
  when: string;
  offset: string;
}

/** La hora en la sede del evento, cuando su zona marca otra cosa que la de la pantalla. */
export interface AuditSedeTime {
  name: string;
  /** «—» si la sede no tiene formato o ya no está en la lista: nunca otro formato. */
  when: string;
  offset: string | null;
}

export interface AuditTime {
  iso: string;
  /** En la zona y con el formato de la sede de la pantalla: la misma para todas las filas. */
  reference: AuditInstant;
  sede: AuditSedeTime | null;
}

/** Nombre de una sede que ya no está en la lista: nunca su id. */
export const UNKNOWN_SEDE_NAME = 'Su sede';

function instantIn(instant: Date, clock: SedeClock): AuditInstant {
  return { when: clock.fmt.dateTime(instant, clock.timeZone), offset: utcOffsetLabel(instant, clock.timeZone) };
}

/**
 * La hora de un evento de auditoría (DX-362). Todas las filas van en la zona
 * de la sede de la pantalla (la activa, o la principal en «Todas las sedes»),
 * la misma con la que se cuentan los días de los filtros: así la lista, que
 * llega ordenada por instante, se lee cronológica. Cada hora dice su desfase.
 *
 * Si el evento es de una sede cuyo reloj marca otra hora en ese instante, se
 * añade la hora de esa sede con su formato: la que vio la clínica (DX-009,
 * DX-314). Un evento sin sede (un inicio de sesión) no tiene otra hora.
 */
export function auditTime(
  event: Pick<AuditEvent, 'occurredAt' | 'locationId' | 'timeZone'>,
  clock: AgendaClock,
  names: LocationNames | null,
): AuditTime {
  const instant = new Date(event.occurredAt);
  const reference = instantIn(instant, clock);
  if (!event.locationId) return { iso: event.occurredAt, reference, sede: null };
  const own = clock.of(event.locationId);
  // Sin el reloj de la sede, su zona la dice la API con la fila.
  const ownZone = own?.timeZone ?? event.timeZone;
  if (zoneOffsetMinutes(instant, ownZone) === zoneOffsetMinutes(instant, clock.timeZone)) {
    return { iso: event.occurredAt, reference, sede: null };
  }
  const name = names?.get(event.locationId.toLowerCase()) ?? UNKNOWN_SEDE_NAME;
  const sede: AuditSedeTime = own
    ? { name, ...instantIn(instant, own) }
    : { name, when: NO_SEDE_FORMAT, offset: null };
  return { iso: event.occurredAt, reference, sede };
}

/** La zona de la pantalla, junto a los filtros: con qué zona se leen las horas y los días. */
export function auditZoneHint(
  location: Pick<ClinicLocation, 'name'>,
  clock: SedeClock,
  now: Date,
): string {
  return `Horas y días en la hora de ${location.name} (${clock.timeZone}, ${utcOffsetLabel(now, clock.timeZone)}). Lo más reciente, arriba.`;
}

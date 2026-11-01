import { ApiError } from '@/lib/api/api-error';
import type { MoveTarget } from '@/lib/appointments/day-grid';
import { findOpenings } from '@/lib/appointments/waitlist-api';
import { addCivilDays, wallDay } from '@/lib/time/wall-clock';

/** Código del 409 de solape al mover (profesional o paciente), DX-509-bis. */
export const APPOINTMENT_OVERLAP = 'APPOINTMENT_OVERLAP';

/** Días que se miran (el del destino incluido) para proponer el siguiente hueco. */
export const NEXT_OPENING_DAYS = 14;

/**
 * El movimiento de un SOBRECUPO chocó con otra cita (del profesional o del
 * paciente): se puede ofrecer el siguiente hueco libre. Otros 409 (paciente en
 * la clínica, sillón ocupado...) no: el hueco no es el problema.
 */
export function canOfferNextOpening(appointment: { overbooked?: boolean | null }, err: unknown): boolean {
  return appointment.overbooked === true && err instanceof ApiError && err.code === APPOINTMENT_OVERLAP;
}

/**
 * DX-509-bis: el primer hueco libre del profesional destino, en la sede de la
 * cita, que empieza a la hora pedida o después y en el que cabe su duración
 * (con las otras citas del paciente; la propia no ocupa). `null` si no hay
 * ninguno en `NEXT_OPENING_DAYS` días.
 */
export async function findNextOpening(
  token: string,
  appointment: { id: string; start: string; end: string; patientId: string; locationId: string },
  target: MoveTarget,
  timeZone: string,
): Promise<MoveTarget | null> {
  const duration = new Date(appointment.end).getTime() - new Date(appointment.start).getTime();
  const from = wallDay(target.start, timeZone);
  const { openings } = await findOpenings(token, {
    providerId: target.providerId,
    locationId: appointment.locationId,
    from,
    to: addCivilDays(from, NEXT_OPENING_DAYS - 1),
    durationMinutes: Math.round(duration / 60_000),
    patientId: appointment.patientId,
    excludeAppointmentId: appointment.id,
  });
  const wanted = new Date(target.start).getTime();
  for (const opening of openings) {
    const start = Math.max(new Date(opening.start).getTime(), wanted);
    if (new Date(opening.end).getTime() - start >= duration) {
      return {
        start: new Date(start).toISOString(),
        end: new Date(start + duration).toISOString(),
        providerId: target.providerId,
      };
    }
  }
  return null;
}

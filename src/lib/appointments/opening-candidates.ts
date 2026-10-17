import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { formatTime } from '@/lib/format/date';
import type { BusinessHours } from '@/lib/locations/schedule-api';
import type { Appointment } from './appointments-api';
import { longAppointmentDay } from './confirmation-message';
import { blockShownInColumn, type ScheduleBlockLike } from './schedule-blocks';
import type { AppointmentWrite } from './waitlist-api';

// DX-210: «Ocupar este hueco», del contrato generado.
export type OpeningCandidates = components['schemas']['OpeningCandidatesDto'];
export type OpeningCandidate = components['schemas']['OpeningCandidateDto'];
export type WaitlistOffer = components['schemas']['CreatedWaitlistOfferDto'];
export type OfferOutcome = components['schemas']['RecordWaitlistOfferOutcomeDto']['outcome'];

/** Un hueco libre de la agenda: `[start, end)` en una sede y una columna. */
export interface OpeningSlot {
  locationId: string;
  providerId: string;
  start: string;
  end: string;
}

/** `GET /appointments/openings/:locationId/candidates`. */
export async function listOpeningCandidates(
  token: string,
  slot: OpeningSlot,
): Promise<OpeningCandidates> {
  const search = new URLSearchParams({
    start: slot.start,
    end: slot.end,
    providerId: slot.providerId,
  });
  return apiFetch<OpeningCandidates>(
    `/appointments/openings/${slot.locationId}/candidates?${search.toString()}`,
    { token },
  );
}

/** «Ofrecer por WhatsApp» (`WA_ME`, nace pendiente) o «Llamé» (`PHONE`, con resultado). */
export async function createWaitlistOffer(
  token: string,
  slot: OpeningSlot,
  candidate: Pick<OpeningCandidate, 'patientId' | 'waitlistEntryId' | 'appointmentId'>,
  offer: { channel: 'WA_ME' } | { channel: 'PHONE'; outcome: OfferOutcome },
): Promise<WaitlistOffer> {
  return apiFetch<WaitlistOffer>(`/appointments/openings/${slot.locationId}/offers`, {
    method: 'POST',
    token,
    body: {
      slotStart: slot.start,
      slotEnd: slot.end,
      providerId: slot.providerId,
      patientId: candidate.patientId,
      ...(candidate.waitlistEntryId ? { waitlistEntryId: candidate.waitlistEntryId } : {}),
      ...(candidate.appointmentId ? { appointmentId: candidate.appointmentId } : {}),
      ...offer,
    },
  });
}

/** Respuesta del paciente a una oferta pendiente (p. ej. contestó el WhatsApp). */
export async function recordOfferOutcome(
  token: string,
  offerId: string,
  outcome: OfferOutcome,
): Promise<void> {
  await apiFetch(`/appointments/openings/offers/${offerId}`, {
    method: 'PATCH',
    token,
    body: { outcome },
  });
}

/** «Asignar» una cita marcada «Adelantar si hay hueco»: `PATCH /appointments/:id/opening`. */
export async function moveAppointmentToOpening(
  token: string,
  appointmentId: string,
  slot: Pick<OpeningSlot, 'start' | 'providerId'>,
): Promise<AppointmentWrite> {
  return apiFetch<AppointmentWrite>(`/appointments/${appointmentId}/opening`, {
    method: 'PATCH',
    token,
    body: { start: slot.start, providerId: slot.providerId },
  });
}

/** Ven los candidatos: recepción y ADMIN de cualquier columna; el odontólogo, de la suya. */
export function canSeeOpeningCandidates(
  role: ClinicRole | null,
  userId: string | null,
  providerId: string,
): boolean {
  if (role === 'RECEPTION' || role === 'ADMIN') return true;
  return role === 'DENTIST' && userId !== null && userId === providerId;
}

/** Ofrecen y asignan: recepción y ADMIN (lo mismo que exige la API). */
export function canOfferOpenings(role: ClinicRole | null): boolean {
  return role === 'RECEPTION' || role === 'ADMIN';
}

/**
 * Texto del `wa.me`: SOLO nombre de pila, fecha, hora, sede y profesional
 * (Ley 1581 / RGPD, minimización). Nunca el motivo ni el tratamiento: un chat
 * no es un canal seguro y el mensaje se queda en el móvil del paciente.
 */
export function offerMessage({
  firstName,
  start,
  locationName,
  providerName,
}: {
  firstName: string;
  start: string;
  locationName: string;
  providerName: string | null;
}): string {
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const greeting = first ? `Hola ${first}` : 'Hola';
  const withWhom = providerName ? ` con ${providerName}` : '';
  return (
    `${greeting}, te escribimos de ${locationName}. Se liberó un hueco el ` +
    `${longAppointmentDay(start)} a las ${formatTime(start)}${withWhom}. ` +
    '¿Te gustaría tomarlo? Respóndenos por aquí y te lo reservamos.'
  );
}

/** Un hueco libre de una columna, en minutos locales del día y como instantes. */
export interface FreeGap {
  startMinute: number;
  endMinute: number;
  start: string;
  end: string;
}

/** El hueco más corto que se ofrece (y que cabe una cita de la rejilla). */
export const MIN_GAP_MINUTES = 15;
const STEP = 5;

/**
 * Huecos libres de la columna de `providerId` el día `date` (`YYYY-MM-DD`
 * local): los tramos del horario de la sede menos sus citas activas (una
 * cancelada libera su hora; un no-show no, como la restricción de la BD) y los
 * bloqueos que no dejan agendar; sin el pasado y de al menos 15 min. Sin
 * horario configurado no hay huecos que proponer.
 */
export function freeGaps({
  date,
  hours,
  appointments,
  blocks,
  providerId,
  activeLocationId,
  now,
}: {
  date: string;
  hours: BusinessHours | null;
  appointments: Pick<Appointment, 'providerId' | 'start' | 'end' | 'status'>[];
  blocks: ScheduleBlockLike[];
  providerId: string;
  activeLocationId: string | null;
  now: Date;
}): FreeGap[] {
  if (!hours) return [];
  const midnight = new Date(`${date}T00:00:00`);
  const weekday = midnight.getDay();
  const toMinute = (iso: string) => Math.round((new Date(iso).getTime() - midnight.getTime()) / 60000);
  const busy = [
    ...appointments
      .filter((a) => a.providerId === providerId && a.status !== 'CANCELLED')
      .map((a) => ({ start: toMinute(a.start), end: toMinute(a.end) })),
    ...blocks
      .filter((b) => !b.allowsBooking && blockShownInColumn(b, providerId, activeLocationId))
      .map((b) => ({ start: toMinute(b.start), end: toMinute(b.end) })),
  ].sort((a, b) => a.start - b.start);
  const nowMinute = Math.ceil((now.getTime() - midnight.getTime()) / 60000 / STEP) * STEP;

  const gaps: FreeGap[] = [];
  const ranges = hours.ranges
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);
  for (const range of ranges) {
    let cursor = Math.max(range.startMinute, nowMinute);
    const push = (end: number) => {
      if (end - cursor >= MIN_GAP_MINUTES) {
        gaps.push({
          startMinute: cursor,
          endMinute: end,
          start: new Date(midnight.getTime() + cursor * 60000).toISOString(),
          end: new Date(midnight.getTime() + end * 60000).toISOString(),
        });
      }
    };
    for (const b of busy) {
      if (b.end <= cursor || b.start >= range.endMinute) continue;
      if (b.start > cursor) push(Math.min(b.start, range.endMinute));
      cursor = Math.max(cursor, b.end);
      if (cursor >= range.endMinute) break;
    }
    if (cursor < range.endMinute) push(range.endMinute);
  }
  return gaps;
}

import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { BusinessHours } from '@/lib/locations/schedule-api';
import type { Appointment } from './appointments-api';
import { longAppointmentDay } from './confirmation-message';
import { blockShownInColumn, type ScheduleBlockLike } from './schedule-blocks';
import type { AppointmentWrite } from './waitlist-api';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { civilWeekday } from '@/lib/time/civil-day';
import { wallInstant, wallMinuteOfDay } from '@/lib/time/wall-clock';
import { endSentence } from '@/lib/format/text';

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

/** DX-435: canales de la oferta con enlace. */
export type LinkOfferChannel = 'LINK_EMAIL' | 'LINK_WA_ME';
export type SlotLinkOffers = OpeningCandidates['linkOffers'];

/**
 * «Enviar oferta con enlace» (DX-435): la API crea la oferta con su token (el
 * paciente la acepta solo; el primero que acepta se queda el hueco). Por
 * email la envía el outbox; por WhatsApp vuelve `url` para el texto de wa.me.
 */
export async function createLinkOffer(
  token: string,
  slot: OpeningSlot,
  candidate: Pick<OpeningCandidate, 'patientId' | 'waitlistEntryId' | 'appointmentId'>,
  channel: LinkOfferChannel,
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
      channel,
    },
  });
}

/** ¿A quién se le puede mandar el enlace por cada canal? (DX-128, lo vuelve a mirar la API). */
export function linkOfferChannels(c: OpeningCandidate): Record<LinkOfferChannel, boolean> {
  return {
    LINK_EMAIL: c.emailBlockedReason === null,
    LINK_WA_ME: !c.whatsappBlocked && c.whatsappPhone !== null,
  };
}

/**
 * El texto de wa.me de la oferta con enlace: el de DX-210 (sin datos
 * clínicos) con el enlace para aceptarlo, en vez de «respóndenos».
 */
export function linkOfferMessage({
  firstName,
  start,
  locationName,
  providerName,
  clock,
  url,
}: {
  firstName: string;
  start: string;
  locationName: string;
  providerName: string | null;
  clock: SedeClock;
  url: string;
}): string {
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const greeting = first ? `Hola ${first}` : 'Hola';
  const withWhom = providerName ? ` con ${providerName}` : '';
  // «10:00 a. m.» ya trae su punto: `endSentence` no pone otro.
  const slot = endSentence(
    `${greeting}, te escribimos de ${locationName}. Se liberó un hueco el ` +
      `${longAppointmentDay(start, clock.timeZone)} a las ${sedeTime(start, clock)}${withWhom}`,
  );
  return `${slot} Si te viene bien, acéptalo aquí (se lo queda el primero que lo acepte): ${url}`;
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
  clock,
}: {
  firstName: string;
  start: string;
  locationName: string;
  providerName: string | null;
  /** Reloj de la sede del hueco: el día y la hora que verá el paciente. */
  clock: SedeClock;
}): string {
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const greeting = first ? `Hola ${first}` : 'Hola';
  const withWhom = providerName ? ` con ${providerName}` : '';
  return (
    `${greeting}, te escribimos de ${locationName}. Se liberó un hueco el ` +
    `${longAppointmentDay(start, clock.timeZone)} a las ${sedeTime(start, clock)}${withWhom}. ` +
    '¿Te gustaría tomarlo? Respóndenos por aquí y te lo reservamos.'
  );
}

type DayRange = { startMinute: number; endMinute: number };

/** La parte común de los tramos de la sede y los del profesional (`null` = todos). */
function intersectRanges(location: DayRange[], provider: DayRange[] | null): DayRange[] {
  if (provider === null) return location.map((r) => ({ startMinute: r.startMinute, endMinute: r.endMinute }));
  const out: DayRange[] = [];
  for (const a of location) {
    for (const b of provider) {
      const startMinute = Math.max(a.startMinute, b.startMinute);
      const endMinute = Math.min(a.endMinute, b.endMinute);
      if (endMinute > startMinute) out.push({ startMinute, endMinute });
    }
  }
  return out;
}

/** Un hueco libre de una columna, en minutos del día en el reloj de la sede y como instantes. */
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
 * Huecos libres de la columna de `providerId` el día civil `date` en el reloj
 * de la sede (`timeZone`): los tramos del horario de la sede menos sus citas activas (una
 * cancelada libera su hora; un no-show no, como la restricción de la BD) y los
 * bloqueos que no dejan agendar; sin el pasado y de al menos 15 min. Sin
 * horario configurado no hay huecos que proponer. Con horario del profesional
 * (DX-233), solo dentro de sus tramos en la sede.
 */
export function freeGaps({
  date,
  hours,
  appointments,
  blocks,
  providerId,
  activeLocationId,
  now,
  timeZone,
  providerRanges = null,
}: {
  date: string;
  /** Zona de la sede: el horario y los minutos son los de su reloj. */
  timeZone: string;
  hours: BusinessHours | null;
  /**
   * DX-233: tramos del profesional ese día en la sede (del cuadrante). `null`
   * = sin horario propio (sin restricción); vacío = no trabaja allí ese día.
   */
  providerRanges?: { startMinute: number; endMinute: number }[] | null;
  appointments: Pick<Appointment, 'providerId' | 'start' | 'end' | 'status'>[];
  blocks: ScheduleBlockLike[];
  providerId: string;
  activeLocationId: string | null;
  now: Date;
}): FreeGap[] {
  if (!hours) return [];
  const weekday = civilWeekday(date);
  const dayStart = wallInstant(date, 0, timeZone).getTime();
  const dayEnd = wallInstant(date, 24 * 60, timeZone).getTime();
  // Minuto del reloj de la sede; lo que cae antes o después del día, a su borde.
  const toMinute = (instant: string | Date) => {
    const ms = new Date(instant).getTime();
    if (ms <= dayStart) return 0;
    if (ms >= dayEnd) return 24 * 60;
    return wallMinuteOfDay(instant, timeZone);
  };
  const busy = [
    ...appointments
      .filter((a) => a.providerId === providerId && a.status !== 'CANCELLED')
      .map((a) => ({ start: toMinute(a.start), end: toMinute(a.end) })),
    ...blocks
      .filter((b) => !b.allowsBooking && blockShownInColumn(b, providerId, activeLocationId))
      .map((b) => ({ start: toMinute(b.start), end: toMinute(b.end) })),
  ].sort((a, b) => a.start - b.start);
  const nowMinute = Math.ceil(toMinute(now) / STEP) * STEP;

  const gaps: FreeGap[] = [];
  const ranges = intersectRanges(
    hours.ranges.filter((r) => r.weekday === weekday),
    providerRanges,
  ).sort((a, b) => a.startMinute - b.startMinute);
  for (const range of ranges) {
    let cursor = Math.max(range.startMinute, nowMinute);
    const push = (end: number) => {
      if (end - cursor >= MIN_GAP_MINUTES) {
        gaps.push({
          startMinute: cursor,
          endMinute: end,
          start: wallInstant(date, cursor, timeZone).toISOString(),
          end: wallInstant(date, end, timeZone).toISOString(),
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

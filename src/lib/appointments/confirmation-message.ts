import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import type { Appointment } from './appointments-api';
import type { ConfirmationAppointment } from './confirmations-api';
import { preVisitLead, resolvePreVisitInstruction, type PreVisitInstruction } from './pre-visit-instructions';

/** "martes, 20 de octubre": el día del instante en la zona de la sede, nunca en la del navegador. */
export function longAppointmentDay(iso: string, timeZone: string): string {
  return civilDateLabel(wallDay(iso, timeZone), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** DX-564: tope del mensaje prellenado entero (las indicaciones se recortan con «…»). */
export const CONFIRMATION_MESSAGE_MAX = 1500;

interface ConfirmationMessageCopy {
  greeting: (name: string | null) => string;
  body: (p: { day: string; time: string; withWhom: string; where: string; url: string }) => string;
  withWhom: (provider: string) => string;
  anamnesisLink: (url: string) => string;
  anamnesisPending: string;
}

/**
 * DX-564: el mensaje en el idioma del paciente. Catálogo por CLAVE e idioma
 * (añadir un idioma = añadir su entrada); sin catálogo para el suyo, español.
 * La fecha y la hora salen siempre con el formato de la sede (DX-354), como
 * en la página pública.
 */
const MESSAGE_COPY: Record<'es' | 'en', ConfirmationMessageCopy> = {
  es: {
    greeting: (name) => (name ? `Hola ${name}` : 'Hola'),
    body: ({ day, time, withWhom, where, url }) =>
      `te recordamos tu cita del ${day} a las ${time}${withWhom} en ${where}. ` +
      `Confírmala, cancélala o pide que te llamemos aquí: ${url}`,
    withWhom: (provider) => ` con ${provider}`,
    anamnesisLink: (url) => ` Antes de la cita, responde el cuestionario de salud: ${url}`,
    anamnesisPending: ' Si aún no completaste el cuestionario de salud, usa el enlace que te enviamos.',
  },
  en: {
    greeting: (name) => (name ? `Hello ${name}` : 'Hello'),
    body: ({ day, time, withWhom, where, url }) =>
      `this is a reminder of your appointment on ${day} at ${time}${withWhom} at ${where}. ` +
      `Confirm it, cancel it or ask us to call you here: ${url}`,
    withWhom: (provider) => ` with ${provider}`,
    anamnesisLink: (url) => ` Before your appointment, please answer the health questionnaire: ${url}`,
    anamnesisPending: ' If you have not completed the health questionnaire yet, please use the link we sent you.',
  },
};

/** Idioma del catálogo para la etiqueta del paciente: exacta, base, si no español. */
export function confirmationMessageLanguage(tag: string | null | undefined): 'es' | 'en' {
  const lower = tag?.trim().toLowerCase();
  if (!lower) return 'es';
  const base = lower.split('-')[0];
  return base === 'en' ? 'en' : 'es';
}

/** Recorta a `max` caracteres (code points) con «…» al final. */
function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  if (max <= 1) return '…';
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * Mensaje prellenado para WhatsApp (o para pegar donde sea). Solo lo que el
 * paciente necesita para reconocer la cita: cuándo, con quién y dónde, más el
 * enlace — nada clínico, porque un chat no es un canal seguro.
 *
 * DX-564: en el idioma del paciente (`patientLanguage`; sin catálogo, español)
 * y, si el tipo de cita tiene indicaciones previas, «Antes de tu cita: …» con
 * la variante resuelta (exacta → base → español). Son texto general de la
 * clínica por tipo de cita, no dato del paciente. El mensaje entero no pasa de
 * {@link CONFIRMATION_MESSAGE_MAX} caracteres: se recortan las indicaciones.
 */
export function confirmationMessage({
  url,
  appointment,
  clock,
  anamnesisUrl = null,
  anamnesisPending = false,
  patientLanguage = null,
  preVisitInstructions = [],
}: {
  url: string;
  appointment: ConfirmationAppointment;
  /**
   * DX-290: enlace al cuestionario de salud (paciente nuevo o con la
   * anamnesis caducada). Solo el enlace: el mensaje no dice nada clínico.
   */
  anamnesisUrl?: string | null;
  /** DX-290: ya tiene un enlace vivo de antes: se le recuerda, sin otro. */
  anamnesisPending?: boolean;
  /** Reloj de la sede de la cita: el día y la hora que verá el paciente. */
  clock: SedeClock;
  /** DX-564: idioma preferido del paciente (`null` = el de la clínica). */
  patientLanguage?: string | null;
  /** DX-564: variantes de las indicaciones previas del tipo de la cita. */
  preVisitInstructions?: readonly PreVisitInstruction[];
}): string {
  const language = confirmationMessageLanguage(patientLanguage);
  const t = MESSAGE_COPY[language];
  const where = appointment.locationAddress
    ? `${appointment.locationName} (${appointment.locationAddress})`
    : appointment.locationName;
  const anamnesis = anamnesisUrl ? t.anamnesisLink(anamnesisUrl) : anamnesisPending ? t.anamnesisPending : '';
  const base =
    `${t.greeting(appointment.patientFirstName)}, ` +
    t.body({
      day: longAppointmentDay(appointment.start, clock.timeZone),
      time: sedeTime(appointment.start, clock),
      withWhom: appointment.providerName ? t.withWhom(appointment.providerName) : '',
      where,
      url,
    }) +
    anamnesis;

  const instruction = resolvePreVisitInstruction(preVisitInstructions, patientLanguage);
  if (!instruction) return base;
  const head = `\n\n${preVisitLead(language)} `;
  const room = CONFIRMATION_MESSAGE_MAX - [...base].length - [...head].length;
  // Sin sitio ni para unas palabras: el mensaje va sin el bloque.
  if (room < 20) return base;
  return base + head + truncate(instruction.text, room);
}

/** `https://wa.me/<E.164 sin +>?text=<mensaje>` (abre WhatsApp Web o la app). */
export function whatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export type ConfirmationIndicator = 'callback' | 'pending';

/**
 * Indicador de la tarjeta de la cita. Solo aplica a una cita AGENDADA: si el
 * paciente confirmó o canceló, el propio estado ya lo dice (y el backend
 * limpia las marcas cuando recepción reagenda o cambia el estado a mano).
 */
export function confirmationIndicator(appointment: Appointment): ConfirmationIndicator | null {
  if (appointment.status !== 'SCHEDULED') return null;
  if (appointment.callbackRequestedAt) return 'callback';
  if (appointment.confirmationSentAt) return 'pending';
  return null;
}

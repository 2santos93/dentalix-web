import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import type { Appointment } from './appointments-api';
import type { ConfirmationAppointment } from './confirmations-api';

/** "martes, 20 de octubre": el día del instante en la zona de la sede, nunca en la del navegador. */
export function longAppointmentDay(iso: string, timeZone: string): string {
  return civilDateLabel(wallDay(iso, timeZone), { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Mensaje prellenado para WhatsApp (o para pegar donde sea). Solo lo que el
 * paciente necesita para reconocer la cita: cuándo, con quién y dónde, más el
 * enlace — nada clínico, porque un chat no es un canal seguro.
 */
export function confirmationMessage({
  url,
  appointment,
  clock,
}: {
  url: string;
  appointment: ConfirmationAppointment;
  /** Reloj de la sede de la cita: el día y la hora que verá el paciente. */
  clock: SedeClock;
}): string {
  const greeting = appointment.patientFirstName ? `Hola ${appointment.patientFirstName}` : 'Hola';
  const withWhom = appointment.providerName ? ` con ${appointment.providerName}` : '';
  const where = appointment.locationAddress
    ? `${appointment.locationName} (${appointment.locationAddress})`
    : appointment.locationName;
  return (
    `${greeting}, te recordamos tu cita del ${longAppointmentDay(appointment.start, clock.timeZone)} ` +
    `a las ${sedeTime(appointment.start, clock)}${withWhom} en ${where}. ` +
    `Confírmala, cancélala o pide que te llamemos aquí: ${url}`
  );
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

import { civilDateLabel } from '@/lib/format/date';
import { wallDay } from '@/lib/time/wall-clock';
import type { Appointment } from './appointments-api';

/** "martes, 20 de octubre": el día del instante en la zona de la sede, nunca en la del navegador. */
export function longAppointmentDay(iso: string, timeZone: string): string {
  return civilDateLabel(wallDay(iso, timeZone), { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * `https://wa.me/<E.164 sin +>?text=<mensaje>` (abre WhatsApp Web o la app).
 * DX-565: la confirmación y la oferta con enlace ya no se componen aquí: la API
 * devuelve `whatsappText` con la plantilla de la clínica (Ajustes › Mensajes).
 */
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

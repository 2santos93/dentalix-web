import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import type { SedeClock } from '@/lib/locations/sede-clock';
import type { ClinicRole } from '@/lib/me/me-api';
import type { RecallContactChannel, RecallContactOutcome, RecallKind } from './recall-api';

/** Tope de la nota de un contacto (igual que la API). */
export const RECALL_NOTE_MAX = 280;
/** Tope del motivo de una pausa (igual que la API). */
export const RECALL_REASON_MAX = 120;
/** Intervalos que se ofrecen (la API admite de 1 a 36 meses). */
export const RECALL_INTERVALS: readonly number[] = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36];
/** La ventana de «vence pronto» de la lista. */
export const RECALL_SOON_DAYS = 30;

export const KIND_LABELS: Record<RecallKind, string> = { HYGIENE: 'Higiene', CHECKUP: 'Control' };
export const KIND_ORDER: readonly RecallKind[] = ['CHECKUP', 'HYGIENE'];

export const CHANNEL_LABELS: Record<RecallContactChannel, string> = {
  CALL: 'Llamada',
  WHATSAPP_LINK: 'WhatsApp',
  EMAIL: 'Email',
  IN_PERSON: 'En persona',
};
export const CHANNEL_ORDER: readonly RecallContactChannel[] = ['CALL', 'WHATSAPP_LINK', 'EMAIL', 'IN_PERSON'];

export const OUTCOME_LABELS: Record<RecallContactOutcome, string> = {
  NO_ANSWER: 'No contesta',
  LEFT_MESSAGE: 'Dejó mensaje',
  CALL_BACK: 'Llamar luego',
  WILL_BOOK: 'Va a agendar',
  DECLINED: 'Rechaza',
  WRONG_NUMBER: 'Número erróneo',
  BOOKED: 'Agendó',
};
/** Sin «Agendó»: exige la cita, y agendar ya saca al paciente de la lista. */
export const OUTCOME_ORDER: readonly RecallContactOutcome[] = [
  'NO_ANSWER',
  'LEFT_MESSAGE',
  'CALL_BACK',
  'WILL_BOOK',
  'DECLINED',
  'WRONG_NUMBER',
];

/** Quién trabaja la lista: como `RECALL_LIST_ROLES` en la API. */
export function canManageRecall(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** Quién fija o pausa un recall: como `RECALL_INTERVAL_ROLES` (CLINICAL_ROLES). */
export function canSetRecall(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT';
}

export function intervalLabel(months: number): string {
  return months === 1 ? 'Cada mes' : `Cada ${months} meses`;
}

/** Días de vencido, en palabras: negativo = aún faltan. */
export function overdueLabel(days: number): string {
  if (days === 0) return 'Vence hoy';
  const n = Math.abs(days);
  const word = n === 1 ? '1 día' : `${n} días`;
  return days > 0 ? `Hace ${word}` : `Vence en ${word}`;
}

/** Sin datos clínicos: un recordatorio de control, nunca qué se le hizo. */
export function recallMessage(patientName: string, clinicName: string | null): string {
  const firstName = patientName.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  return `${greeting}, te escribimos de ${clinicName ?? 'la clínica'}. Ya te toca tu control. ¿Te ayudamos a agendar tu cita?`;
}

export function recallWhatsAppHref(
  item: { patientName: string; patientWhatsApp: string | null },
  clinicName: string | null,
): string | null {
  if (!item.patientWhatsApp) return null;
  return whatsAppUrl(item.patientWhatsApp, recallMessage(item.patientName, clinicName));
}

/** Fecha y hora de un contacto, en el reloj de la sede (DX-378); «—» hasta tenerlo. */
export function contactMoment(iso: string, clock: SedeClock | null): string {
  return clock ? clock.fmt.dateTime(new Date(iso), clock.timeZone) : '—';
}

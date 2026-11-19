import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import type { ClinicRole } from '@/lib/me/me-api';
import { addCivilDays } from '@/lib/time/wall-clock';
import type { RecallContactChannel, RecallContactOutcome, RecallKind } from './recall-api';

/** Tope de la nota de un contacto (igual que la API). */
export const RECALL_NOTE_MAX = 280;
/** Tope del motivo de una pausa (igual que la API). */
export const RECALL_REASON_MAX = 120;
/** Intervalos que se ofrecen (la API admite de 1 a 36 meses). */
export const RECALL_INTERVALS: readonly number[] = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36];
/** DX-465: «Llamar luego» admite de hoy a 90 días en la sede del paciente (igual que la API). */
export const RECALL_CALLBACK_MAX_DAYS = 90;
/** La ventana de «vence pronto» de la lista. */
export const RECALL_SOON_DAYS = 30;

/**
 * Respaldo de los nombres por clave (DX-015-bis): los tipos salen de
 * `GET /recall-types`; esto solo se usa si esa lectura falla. Mismo orden que
 * los tipos por defecto de la API.
 */
export const KIND_LABELS: Record<RecallKind, string> = { HYGIENE: 'Higiene', CHECKUP: 'Control' };
export const KIND_ORDER: readonly RecallKind[] = ['HYGIENE', 'CHECKUP'];

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
/**
 * Los resultados de «Registrar contacto». «Agendó» (DX-015-bis, D23) no se
 * guarda ahí: exige la cita, así que abre «Agendar» con el canal y la nota, y
 * el contacto se registra al crearla.
 */
export const OUTCOME_ORDER: readonly RecallContactOutcome[] = [
  'NO_ANSWER',
  'LEFT_MESSAGE',
  'CALL_BACK',
  'WILL_BOOK',
  'BOOKED',
  'DECLINED',
  'WRONG_NUMBER',
];

/** DX-465: los desenlaces del lote: todos menos «Agendó», que exige la cita de cada paciente. */
export const BATCH_OUTCOME_ORDER: readonly RecallContactOutcome[] = OUTCOME_ORDER.filter((o) => o !== 'BOOKED');

/** DX-465: «2 de 3»: intentos del ciclo frente al tope de la sede del paciente. */
export function attemptsLabel(attempts: number, maxAttempts: number): string {
  return `${attempts} de ${maxAttempts}`;
}

/**
 * DX-465: los días que admite «Llamar luego» (de hoy a 90 días en la sede de
 * cada paciente). Con varias sedes (el lote), el rango que vale en todas: desde
 * el «hoy» más tardío hasta 90 días después del más temprano. `null` si no se
 * sabe el «hoy» de alguna (sede sin zona horaria).
 */
export function callbackRange(todays: readonly (string | null)[]): { min: string; max: string } | null {
  if (todays.length === 0 || todays.some((t) => !t)) return null;
  const days = (todays as string[]).slice().sort();
  return { min: days[days.length - 1], max: addCivilDays(days[0], RECALL_CALLBACK_MAX_DAYS) };
}

export const callbackCopy = {
  label: 'Volver a llamar el',
  hint: `De hoy a ${RECALL_CALLBACK_MAX_DAYS} días. Ese día vuelve a la lista.`,
  required: 'Elige el día para volver a llamar.',
  past: 'La fecha para volver a llamar no puede ser anterior a hoy.',
  tooFar: `La fecha para volver a llamar admite hasta ${RECALL_CALLBACK_MAX_DAYS} días desde hoy.`,
};

/** DX-465: el error de la fecha de «Llamar luego», con los textos de la API; `null` si vale. */
export function callbackError(value: string | null, range: { min: string; max: string } | null): string | null {
  if (!value) return callbackCopy.required;
  if (!range) return null;
  if (value < range.min) return callbackCopy.past;
  if (value > range.max) return callbackCopy.tooFar;
  return null;
}

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

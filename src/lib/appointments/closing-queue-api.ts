import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// Tipos del cliente generado (`npm run codegen`), DX-439.
export type ClosingQueue = Schemas['ClosingQueueDto'];
export type ClosingAppointment = Schemas['ClosingAppointmentDto'];
export type ClosingTreatment = Schemas['ClosingTreatmentDto'];
export type ClosingKeptOverbook = Schemas['ClosingKeptOverbookDto'];
export type ClosingQueueSection = Schemas['ClosingQueueSection'];
export type ClosingDismissalReason = Schemas['ClosingDismissalReason'];
export type CreateClosingDismissal = Schemas['CreateClosingDismissalDto'];
export type ClosingDismissal = Schemas['ClosingDismissalDto'];

export const CLOSING_QUEUE_HREF = '/agenda/pendiente-de-cerrar';

/** CLOSING_QUEUE_ROLES en la API: la asistente no tiene lista propia. */
export function canSeeClosingQueue(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'RECEPTION';
}

export const CLOSING_SECTION_TITLES: Record<ClosingQueueSection, string> = {
  OUTCOME: 'Citas sin desenlace',
  EVOLUTION: 'Atendidas sin evolución',
  TREATMENT: 'Tratamiento sin marcar como hecho',
};

export const CLOSING_SECTION_HINTS: Record<ClosingQueueSection, string> = {
  OUTCOME: 'Siguen agendadas o confirmadas: marca si vino, no asistió o se canceló.',
  EVOLUTION: 'Se atendieron y no tienen ninguna evolución ligada a la cita.',
  TREATMENT: 'Se atendieron y el procedimiento ligado a la cita sigue «Aceptado».',
};

/** Orden de la lista y del modal (el de la API). */
export const CLOSING_DISMISSAL_REASONS: readonly ClosingDismissalReason[] = [
  'PATIENT_DECLINED_TODAY',
  'PAPER_NOTE',
  'DUPLICATE_APPOINTMENT',
  'OTHER',
];

export const CLOSING_DISMISSAL_REASON_LABELS: Record<ClosingDismissalReason, string> = {
  PATIENT_DECLINED_TODAY: 'Paciente no quiso el tratamiento hoy',
  PAPER_NOTE: 'Nota en papel / se registra después',
  DUPLICATE_APPOINTMENT: 'Cita duplicada',
  OTHER: 'Otro',
};

/** Texto de «Otro» (los topes de la API). */
export const DISMISSAL_TEXT_MIN = 3;
export const DISMISSAL_TEXT_MAX = 200;

/** `GET /closing-queue` — las secciones del rol, por defecto los 14 días hasta ayer. */
export function getClosingQueue(token: string): Promise<ClosingQueue> {
  return apiFetch<ClosingQueue>('/closing-queue', { token });
}

/** `POST /closing-queue/dismissals` — descarta UN pendiente con su motivo. */
export function dismissClosingItem(token: string, body: CreateClosingDismissal): Promise<ClosingDismissal> {
  return apiFetch<ClosingDismissal>('/closing-queue/dismissals', { method: 'POST', body, token });
}

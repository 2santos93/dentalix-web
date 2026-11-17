import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// Control postoperatorio (DX-566): tipos del cliente generado (`npm run codegen`).
export type PostOpCheckItem = Schemas['PostOpCheckListItemDto'];
export type PostOpCheckPage = Schemas['PostOpCheckListDto'];
export type PostOpCheckCount = Schemas['PostOpCheckCountDto'];
export type PostOpCheckAttempt = Schemas['PostOpCheckAttemptDto'];
export type PostOpCheckInstruction = Schemas['PostOpInstructionDto'];
export type PostOpAttemptOutcome = Schemas['PostOpAttemptOutcome'];
export type PostOpCheck = Schemas['PostOpCheckDto'];
export type RecordPostOpAttemptInput = Schemas['RecordPostOpAttemptDto'];

export const POST_OP_CHECKS_HREF = '/agenda/controles-postoperatorios';

/** La nota de un intento: hasta 1000 caracteres (la API recorta y rechaza más). */
export const POST_OP_NOTE_MAX = 1000;

/** Al tercer «No contesta» la API cierra el control como «No localizado». */
export const POST_OP_MAX_NO_ANSWER = 3;

/** El motivo de la cita que se agenda tras «Necesita cita». */
export const POST_OP_APPOINTMENT_REASON = 'Revisión postoperatoria';

/** Orden del diálogo «Registrar resultado». */
export const POST_OP_OUTCOME_ORDER: readonly PostOpAttemptOutcome[] = [
  'FINE',
  'DISCOMFORT',
  'NEEDS_APPOINTMENT',
  'NO_ANSWER',
];

export const POST_OP_OUTCOME_LABELS: Record<PostOpAttemptOutcome, string> = {
  FINE: 'Bien',
  DISCOMFORT: 'Molestias',
  NEEDS_APPOINTMENT: 'Necesita cita',
  NO_ANSWER: 'No contesta',
};

/** Registrar el resultado: CLINICAL_ROLES en la API (DENTIST, ASSISTANT, ADMIN). */
export function canRegisterPostOpOutcome(role: ClinicRole | null): boolean {
  return role === 'DENTIST' || role === 'ASSISTANT' || role === 'ADMIN';
}

export interface PostOpCheckFilters {
  /** `overdue` (por defecto): hoy y vencidos; `today`: solo hoy. */
  include?: 'overdue' | 'today';
  page?: number;
  pageSize?: number;
}

function query(filters: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

/**
 * `GET /post-op-checks`: los controles pendientes de la sede activa (cabecera
 * de `apiFetch`), el más vencido primero. Recepción los recibe con
 * `clinicalHidden` y sin procedimiento, intentos ni indicaciones.
 */
export function listPostOpChecks(token: string, filters: PostOpCheckFilters = {}): Promise<PostOpCheckPage> {
  return apiFetch<PostOpCheckPage>(`/post-op-checks${query({ ...filters })}`, { token });
}

/** `GET /post-op-checks/count`: el número de la lista, sin auditoría. */
export function countPostOpChecks(
  token: string,
  filters: Pick<PostOpCheckFilters, 'include'> = {},
): Promise<PostOpCheckCount> {
  return apiFetch<PostOpCheckCount>(`/post-op-checks/count${query({ ...filters })}`, { token });
}

/**
 * `POST /post-op-checks/:id/attempts`: un intento con su resultado. «No
 * contesta» suma un intento (al tercero, «No localizado»); los demás cierran
 * el control y lo dejan en la historia clínica.
 */
export function registerPostOpAttempt(
  token: string,
  checkId: string,
  input: RecordPostOpAttemptInput,
): Promise<PostOpCheck> {
  return apiFetch<PostOpCheck>(`/post-op-checks/${encodeURIComponent(checkId)}/attempts`, {
    token,
    method: 'POST',
    body: input,
  });
}

/** El 409 de un control que otra persona ya cerró: se avisa y se relee la lista. */
export function isPostOpCheckClosedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code !== 'LOCATION_LOCALE_REQUIRED';
}

/** «Vence hoy» o «Vencido hace N días». */
export function postOpDueLabel(overdueDays: number): string {
  if (overdueDays <= 0) return 'Vence hoy';
  return overdueDays === 1 ? 'Vencido hace 1 día' : `Vencido hace ${overdueDays} días`;
}

export function postOpAttemptsLabel(n: number): string {
  if (n === 0) return 'Sin intentos';
  return n === 1 ? '1 intento' : `${n} intentos`;
}

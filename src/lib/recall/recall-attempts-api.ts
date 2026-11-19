import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

/**
 * DX-465 · Intentos de recall: lote, ajustes por sede y teléfono por revisar.
 * Aparte de `recall-api.ts` porque ese módulo lo carga el shell de la app (en
 * todas las rutas); esto solo lo piden la lista de recall, la ficha y Ajustes.
 */
/** DX-465: el último intento de una fila de la lista. */
export type RecallLastAttempt = Schemas['RecallLastAttemptDto'];
/** DX-465: el teléfono marcado para revisar por un «Número erróneo» (ficha). */
export type RecallPhoneReview = Schemas['RecallPhoneReviewDto'];
export type CreateRecallContactsBatchInput = Schemas['CreateRecallContactsBatchDto'];
export type RecallContactsBatch = Schemas['RecallContactsBatchDto'];
/** DX-465: días de ocultación y tope de intentos de una sede. */
export type LocationRecallSettings = Schemas['LocationRecallSettingsDto'];
export type UpdateRecallSettingsInput = Schemas['UpdateRecallSettingsDto'];
export type PhoneReviewCleared = Schemas['RecallPhoneReviewClearedDto'];

/** DX-465: límites de la API (DTO y CHECK de `location_recall_settings`). */
export const RECALL_HIDE_DAYS_MIN = 1;
export const RECALL_HIDE_DAYS_MAX = 90;
export const RECALL_MAX_ATTEMPTS_MIN = 1;
export const RECALL_MAX_ATTEMPTS_MAX = 10;
/** Lo que trae una sede sin configurar. */
export const RECALL_DEFAULT_HIDE_DAYS = 7;
export const RECALL_DEFAULT_MAX_ATTEMPTS = 3;
/** Recalls por petición del lote. */
export const RECALL_BATCH_MAX = 50;

/**
 * `POST /recall/contacts/batch` (DX-465): el mismo intento para 1–50 recalls,
 * todo o nada. Sin «Agendó». Con «Llamar luego», `callbackOn` es obligatoria.
 * 404 con `recallIds` si alguno ya no existe; 403 si alguno es de otra sede.
 */
export function createRecallContactsBatch(
  token: string,
  input: CreateRecallContactsBatchInput,
): Promise<RecallContactsBatch> {
  return apiFetch<RecallContactsBatch>('/recall/contacts/batch', { token, method: 'POST', body: input });
}

/** Ajustes de intentos por sede: solo ADMIN (la API responde 403 a los demás, también al leer). */
export function canManageRecallSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /recall-settings` (DX-465): una fila por sede viva; sin configurar, 7 días y 3 intentos. */
export function listRecallSettings(token: string): Promise<LocationRecallSettings[]> {
  return apiFetch<LocationRecallSettings[]>('/recall-settings', { token });
}

/** `PUT /recall-settings/:locationId` (DX-465): reemplaza los dos valores de la sede. */
export function updateRecallSettings(
  token: string,
  locationId: string,
  input: UpdateRecallSettingsInput,
): Promise<LocationRecallSettings> {
  return apiFetch<LocationRecallSettings>(`/recall-settings/${encodeURIComponent(locationId)}`, {
    token,
    method: 'PUT',
    body: input,
  });
}

/**
 * `POST /patients/:id/phone-review/clear` (DX-465): «Ya está corregido».
 * Idempotente: `cleared` es false si no estaba marcado. Cambiar el teléfono
 * del paciente también quita la marca (en el servidor).
 */
export function clearPhoneReview(token: string, patientId: string): Promise<PhoneReviewCleared> {
  return apiFetch<PhoneReviewCleared>(`/patients/${encodeURIComponent(patientId)}/phone-review/clear`, {
    token,
    method: 'POST',
  });
}

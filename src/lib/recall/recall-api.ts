import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// Recall (DX-015): tipos del cliente generado (`npm run codegen`).
export type RecallKind = Schemas['RecallKind'];
export type RecallDueItem = Schemas['RecallDueItemDto'];
export type RecallDuePage = Schemas['RecallDuePageDto'];
export type RecallDueSort = Schemas['RecallDueSort'];
export type RecallContactChannel = Schemas['RecallContactChannel'];
export type RecallContactOutcome = Schemas['RecallContactOutcome'];
export type RecallContact = Schemas['RecallContactDto'];
export type PatientRecall = Schemas['PatientRecallDto'];
export type PatientRecalls = Schemas['PatientRecallsDto'];
export type SetPatientRecallInput = Schemas['SetPatientRecallDto'];
export type CreateRecallContactInput = Schemas['CreateRecallContactDto'];
/** DX-015-bis: un tipo de recall de la clínica (Higiene, Control, Mantenimiento periodontal…). */
export type RecallType = Schemas['RecallTypeDto'];
/** DX-015-bis: un recall que movió el cambio de un ítem del plan (respuesta del PATCH). */
export type ItemRecallUpdate = Schemas['ItemRecallUpdateDto'];
/** DX-015-bis (D9): la respuesta del PUT del recall del paciente, con los que la exclusión desactivó. */
export type SetPatientRecallResult = Schemas['SetPatientRecallResultDto'];
export type RecallExclusionUpdate = Schemas['RecallExclusionUpdateDto'];
export type CreateRecallTypeInput = Schemas['CreateRecallTypeDto'];
export type UpdateRecallTypeInput = Schemas['UpdateRecallTypeDto'];
export type RecallTypeTrigger = Schemas['RecallTypeTriggerDto'];
/** DX-015-bis (D17): un paciente atendido sin recall ni cita («Sin recall configurado»). */
export type RecallUnconfiguredItem = Schemas['RecallUnconfiguredItemDto'];
export type RecallUnconfiguredPage = Schemas['RecallUnconfiguredPageDto'];

/** Crear, editar, retirar y fijar disparadores de los tipos: solo ADMIN (`RECALL_TYPE_WRITE_ROLES`). */
export function canManageRecallTypes(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export interface RecallDueFilters {
  /** Compatibilidad: el filtro por clave cuando no se pudieron leer los tipos. */
  kind?: RecallKind;
  /** DX-015-bis: un tipo de la clínica (`GET /recall-types`). */
  recallTypeId?: string;
  withinDays?: number;
  sort?: RecallDueSort;
  page?: number;
  pageSize?: number;
}

/** `GET /recall/due`: la lista de llamada de la sede activa (cabecera de `apiFetch`). */
export function listRecallDue(token: string, filters: RecallDueFilters = {}): Promise<RecallDuePage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return apiFetch<RecallDuePage>(`/recall/due${query ? `?${query}` : ''}`, { token });
}

/**
 * `GET /recall/unconfigured` (D17): atendidos en los últimos 24 meses sin
 * recall activo ni cita, de la sede activa (cabecera de `apiFetch`).
 */
export function listRecallUnconfigured(
  token: string,
  filters: { page?: number; pageSize?: number; locationId?: string } = {},
): Promise<RecallUnconfiguredPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return apiFetch<RecallUnconfiguredPage>(`/recall/unconfigured${query ? `?${query}` : ''}`, { token });
}

/** `POST /recall/:id/contacts`: append-only; una corrección es otro contacto. */
export function createRecallContact(
  token: string,
  recallId: string,
  input: CreateRecallContactInput,
): Promise<RecallContact> {
  return apiFetch<RecallContact>(`/recall/${recallId}/contacts`, {
    token,
    method: 'POST',
    body: input,
  });
}

/** `GET /patients/:id/recalls`: el bloque de la ficha. */
export function getPatientRecalls(token: string, patientId: string): Promise<PatientRecalls> {
  return apiFetch<PatientRecalls>(`/patients/${patientId}/recalls`, { token });
}

/** `GET /recall-types`: los tipos de la clínica, por su orden (activos o no). */
export function listRecallTypes(token: string): Promise<RecallType[]> {
  return apiFetch<RecallType[]>('/recall-types', { token });
}

/**
 * `PUT /patients/:id/recalls/:type`: fijar, cambiar, pausar o retirar. `type`
 * es el id del tipo (DX-015-bis) o, si no se pudieron leer los tipos, su clave
 * (`HYGIENE`, `CHECKUP`), que la API sigue aceptando.
 */
export function setPatientRecall(
  token: string,
  patientId: string,
  type: string,
  input: SetPatientRecallInput,
): Promise<SetPatientRecallResult> {
  return apiFetch<SetPatientRecallResult>(`/patients/${patientId}/recalls/${encodeURIComponent(type)}`, {
    token,
    method: 'PUT',
    body: input,
  });
}

/**
 * `POST /patients/:id/recalls/default` (D15): crea el recall de un tipo con su
 * intervalo por defecto (también recepción). 409 si ya tiene uno de ese tipo.
 * Desde la salida va `appointmentId` (la cita que se despide): la base es esa
 * cita; sin él, la última atendida («Sin recall configurado»). 422 si la cita
 * no es del paciente o no está en curso ni atendida.
 */
export function createDefaultPatientRecall(
  token: string,
  patientId: string,
  recallTypeId: string,
  appointmentId?: string,
): Promise<SetPatientRecallResult> {
  const body: Schemas['CreateDefaultRecallDto'] = { recallTypeId, ...(appointmentId ? { appointmentId } : {}) };
  return apiFetch<SetPatientRecallResult>(`/patients/${encodeURIComponent(patientId)}/recalls/default`, {
    token,
    method: 'POST',
    body,
  });
}

/**
 * El 409 de D15 porque el paciente ya tiene un recall de ese tipo (alguien lo
 * creó entretanto): se relee la lista. Otro 409 (la sede sin zona horaria) es
 * un error que se enseña.
 */
export function isRecallAlreadySet(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code !== 'LOCATION_TIMEZONE_REQUIRED';
}

/** Avisa a quien pinta el recall del paciente (la ficha) de que cambió fuera de su bloque. */
export const RECALL_CHANGED_EVENT = 'dentalix:recall-changed';
export function announceRecallChanged(patientId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECALL_CHANGED_EVENT, { detail: { patientId } }));
}

/** `POST /recall-types` (ADMIN): nace sin disparadores; se fijan con `setRecallTypeTriggers`. */
export function createRecallType(token: string, input: CreateRecallTypeInput): Promise<RecallType> {
  return apiFetch<RecallType>('/recall-types', { token, method: 'POST', body: input });
}

/**
 * `PATCH /recall-types/:id` (ADMIN). Cambiar el intervalo por defecto o el grupo
 * de exclusión no toca los recalls que ya existen (D10, D11).
 */
export function updateRecallType(token: string, id: string, input: UpdateRecallTypeInput): Promise<RecallType> {
  return apiFetch<RecallType>(`/recall-types/${id}`, { token, method: 'PATCH', body: input });
}

/** `DELETE /recall-types/:id` (ADMIN): borrado lógico; 409 en Higiene y Control (`systemKey`). */
export async function retireRecallType(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/recall-types/${id}`, { token, method: 'DELETE' });
}

/** `PUT /recall-types/:id/triggers` (ADMIN): reemplaza el conjunto; 422 si alguno no es un procedimiento vivo. */
export function setRecallTypeTriggers(token: string, id: string, catalogItemIds: string[]): Promise<RecallType> {
  return apiFetch<RecallType>(`/recall-types/${id}/triggers`, {
    token,
    method: 'PUT',
    body: { catalogItemIds },
  });
}

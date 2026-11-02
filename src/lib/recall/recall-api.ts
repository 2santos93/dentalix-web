import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

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

export interface RecallDueFilters {
  kind?: RecallKind;
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

/** `PUT /patients/:id/recalls/:kind`: fijar, cambiar, pausar o retirar. */
export function setPatientRecall(
  token: string,
  patientId: string,
  kind: RecallKind,
  input: SetPatientRecallInput,
): Promise<PatientRecalls> {
  return apiFetch<PatientRecalls>(`/patients/${patientId}/recalls/${kind}`, {
    token,
    method: 'PUT',
    body: input,
  });
}

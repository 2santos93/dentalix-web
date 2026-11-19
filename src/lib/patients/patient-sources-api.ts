import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-172: «¿Cómo nos conoció?» — el catálogo de fuentes de la clínica y la captación de un paciente.
type Schemas = components['schemas'];

export type PatientSource = Schemas['PatientSourceDto'];
export type PatientSourceKind = Schemas['PatientSourceKind'];

/** Quién recomendó al paciente (`GET /patients/:id/acquisition`). */
export type AcquisitionReferredBy = Schemas['PatientAcquisitionReferrerDto'];

/** `GET /patients/:id/acquisition`: fuente, referente y a quién ha recomendado. */
export type PatientAcquisition = Schemas['PatientAcquisitionDto'];

/** Los topes de la API (patient-source.dto.ts y patient-acquisition.ts). */
export const PATIENT_SOURCE_NAME_MIN = 2;
export const PATIENT_SOURCE_NAME_MAX = 60;
export const REFERRED_BY_NAME_MAX = 120;

export const PATIENT_SOURCE_KIND_LABELS: Record<PatientSourceKind, string> = {
  CHANNEL: 'Canal',
  PATIENT: 'Recomendación de un paciente',
  EXTERNAL_PROFESSIONAL: 'Profesional externo',
};

/** Qué pide el alta con cada tipo (la ayuda del selector de tipo en Ajustes). */
export const PATIENT_SOURCE_KIND_HINTS: Record<PatientSourceKind, string> = {
  CHANNEL: 'Redes, buscadores, carteles… El alta no pide nada más.',
  PATIENT: 'El alta pide el paciente que lo recomendó.',
  EXTERNAL_PROFESSIONAL: 'El alta pide el nombre del profesional que lo derivó.',
};

export const PATIENT_SOURCE_KINDS: readonly PatientSourceKind[] = ['CHANNEL', 'PATIENT', 'EXTERNAL_PROFESSIONAL'];

/** Solo ADMIN gestiona el catálogo (la API responde 403 al resto). */
export function canManagePatientSources(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /patient-sources`: todo el personal. Sin `includeInactive`, solo las activas. */
export function listPatientSources(token: string, includeInactive = false): Promise<PatientSource[]> {
  return apiFetch<PatientSource[]>(`/patient-sources${includeInactive ? '?includeInactive=true' : ''}`, { token });
}

/** `POST /patient-sources` (ADMIN; 409 con un nombre ya usado). */
export function createPatientSource(
  token: string,
  input: { name: string; kind: PatientSourceKind },
): Promise<PatientSource> {
  return apiFetch<PatientSource>('/patient-sources', { token, method: 'POST', body: input });
}

/** `PATCH /patient-sources/:id` (ADMIN): renombrar o activar/desactivar; el tipo no cambia. */
export function updatePatientSource(
  token: string,
  id: string,
  patch: { name?: string; isActive?: boolean },
): Promise<PatientSource> {
  return apiFetch<PatientSource>(`/patient-sources/${encodeURIComponent(id)}`, {
    token,
    method: 'PATCH',
    body: patch,
  });
}

/** `GET /patients/:id/acquisition`: fuente, referente y a cuántos ha recomendado (auditado). */
export function getPatientAcquisition(token: string, patientId: string): Promise<PatientAcquisition> {
  return apiFetch<PatientAcquisition>(`/patients/${encodeURIComponent(patientId)}/acquisition`, { token });
}

/** Lo que el formulario lleva de la captación. */
export interface AcquisitionDraft {
  sourceId: string | null;
  referredBy: { id: string; fullName: string } | null;
  referredByName: string;
}

export const EMPTY_ACQUISITION: AcquisitionDraft = { sourceId: null, referredBy: null, referredByName: '' };

/** El nombre como lo guarda la API: recortado y con los espacios colapsados; vacío = null. */
export function cleanReferredByName(value: string): string | null {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean === '' ? null : clean;
}

/**
 * Los tres campos para la API según el tipo de la fuente elegida: el referente
 * solo con PATIENT y el nombre solo con EXTERNAL_PROFESSIONAL (lo demás, null).
 */
export function acquisitionPayload(
  draft: AcquisitionDraft,
  kind: PatientSourceKind | null,
): { sourceId: string | null; referredByPatientId: string | null; referredByName: string | null } {
  if (!draft.sourceId || !kind) return { sourceId: null, referredByPatientId: null, referredByName: null };
  return {
    sourceId: draft.sourceId,
    referredByPatientId: kind === 'PATIENT' ? (draft.referredBy?.id ?? null) : null,
    referredByName: kind === 'EXTERNAL_PROFESSIONAL' ? cleanReferredByName(draft.referredByName) : null,
  };
}

/** ¿El nombre del profesional cabe? (en caracteres, como la API). */
export function referredByNameTooLong(value: string): boolean {
  const clean = cleanReferredByName(value);
  return clean !== null && [...clean].length > REFERRED_BY_NAME_MAX;
}

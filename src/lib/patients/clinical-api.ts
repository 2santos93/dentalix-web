import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CreateClinicalEntryInput = components['schemas']['CreateClinicalEntryDto'];

/* ── Anamnesis (historia clínica estructurada) ─────────────────────────────
 * Ahora derivados del OpenAPI: el backend documenta las partes anidadas con
 * `@ApiProperty` (ver anamnesis-parts.dto.ts), así que `openapi-typescript`
 * emite las formas reales en vez de `Record<string, never>`. Antes había que
 * escribirlas a mano y mantenerlas en sync con la entidad.
 */

export type Allergy = components['schemas']['AllergyDto'];
export type Condition = components['schemas']['ConditionDto'];
export type Medication = components['schemas']['MedicationDto'];
export type Habits = components['schemas']['HabitsDto'];
export type DentalHistory = components['schemas']['DentalHistoryDto'];
export type Surgery = components['schemas']['SurgeryDto'];
export type VitalSigns = components['schemas']['VitalSignsDto'];
export type SafetyFlags = components['schemas']['SafetyFlagsDto'];

export type AllergyType = Allergy['tipo'];
export type AllergySeverity = Allergy['severidad'];
export type ConditionStatus = Condition['estado'];

/** Cuerpo del `PUT` — todo opcional: una anamnesis puede quedar parcial. */
export type SaveMedicalHistoryInput = components['schemas']['SaveMedicalHistoryDto'];

/**
 * La anamnesis vigente de un paciente (`GET /patients/:id/medical-history`,
 * y lo que devuelve el `PUT`). Sale del OpenAPI, no de una copia a mano.
 *
 * APPEND-ONLY: "la anamnesis actual" = la fila con el `version` más alto del
 * paciente. Guardar nunca actualiza una versión anterior, y cada guardado es
 * un SNAPSHOT COMPLETO: una sección omitida desaparece de la versión nueva.
 *
 * `safetyFlags`/`hasCriticalAlert` los DERIVA el backend; no se envían.
 */
export type MedicalHistory = components['schemas']['MedicalHistoryDto'];

/**
 * `GET /patients/:id/clinical-entries` (and `POST`) — same situation as
 * `MedicalHistory` above. Mirrors
 * `src/modules/clinical-entries/domain/entities/clinical-entry.entity.ts`.
 *
 * This is IMMUTABLE: once created, an entry is never updated or deleted —
 * there is no update/delete endpoint at all. A correction is always a new
 * entry.
 */
export interface ClinicalEntry {
  id: string;
  tenantId: string;
  patientId: string;
  entryDate: string;
  reason: string | null;
  notes: string;
  performedById: string | null;
  createdAt: string;
}

/**
 * Returns the latest anamnesis version, or `null` when the patient doesn't
 * have one yet.
 *
 * CRITICAL: the backend returns `200` with an EMPTY body (content-length 0)
 * for "no history yet" — NOT a JSON `null`. `apiFetch`'s `res.json()` would
 * THROW on that empty body, so this uses `apiFetchOrNull`, which reads the
 * response as text first and only `JSON.parse`s when non-empty.
 */
export async function getMedicalHistory(
  token: string,
  patientId: string,
): Promise<MedicalHistory | null> {
  return apiFetchOrNull<MedicalHistory>(`/patients/${patientId}/medical-history`, {
    token,
  });
}

// Always creates a NEW version (append-only) — never updates the previous
// one, per the backend contract.
export async function saveMedicalHistory(
  token: string,
  patientId: string,
  input: SaveMedicalHistoryInput,
): Promise<MedicalHistory> {
  return apiFetch<MedicalHistory>(`/patients/${patientId}/medical-history`, {
    method: 'PUT',
    body: input,
    token,
  });
}

// Returned DESC by `entryDate` (backend contract).
export async function listClinicalEntries(
  token: string,
  patientId: string,
): Promise<ClinicalEntry[]> {
  return apiFetch<ClinicalEntry[]>(`/patients/${patientId}/clinical-entries`, {
    token,
  });
}

export async function createClinicalEntry(
  token: string,
  patientId: string,
  input: CreateClinicalEntryInput,
): Promise<ClinicalEntry> {
  return apiFetch<ClinicalEntry>(`/patients/${patientId}/clinical-entries`, {
    method: 'POST',
    body: input,
    token,
  });
}

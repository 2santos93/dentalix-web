import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type SaveMedicalHistoryInput = components['schemas']['SaveMedicalHistoryDto'];
export type CreateClinicalEntryInput = components['schemas']['CreateClinicalEntryDto'];

/**
 * `GET /patients/:id/medical-history` (and `PUT`) return a plain TS
 * interface on the backend (`MedicalHistory`), not a class decorated with
 * `@ApiProperty()` — same situation as `Patient` in `patients-api.ts` — so
 * the generated `schema.d.ts` has no body shape for these routes
 * (`content?: never`). Hand-written to mirror `dentalix-api`'s
 * `src/modules/medical-history/domain/entities/medical-history.entity.ts` —
 * keep in sync if that changes.
 *
 * This is APPEND-ONLY: "the current anamnesis" = the row with the highest
 * `version` for a patient. Saving never updates a previous row.
 */
export interface MedicalHistory {
  id: string;
  tenantId: string;
  patientId: string;
  version: number;
  allergies: string | null;
  chronicConditions: string | null;
  currentMedications: string | null;
  habits: string | null;
  medicalAlerts: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
}

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

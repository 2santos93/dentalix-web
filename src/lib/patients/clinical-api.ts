import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicalHistoryValue, MedicalHistory } from '@/lib/clinical/clinical-types';

// `SaveMedicalHistoryDto`'s nested fields (`allergies`/`conditions`/
// `medications`/`habits`/…) generate as `Record<string, never>` — see
// `clinical-types.ts` for why. `ClinicalHistoryValue` is the same shape with
// those fields hand-typed to their real structure.
export type SaveMedicalHistoryInput = ClinicalHistoryValue;
export type CreateClinicalEntryInput = components['schemas']['CreateClinicalEntryDto'];
export type CreateClinicalEntryAddendumInput =
  components['schemas']['CreateClinicalEntryAddendumDto'];

/**
 * Adenda (nota aclaratoria) de una evolución — DX-038. Autor (`authorId`) y
 * fecha (`createdAt`) los pone el servidor; nunca se editan ni se borran.
 */
export type ClinicalEntryAddendum = components['schemas']['ClinicalEntryAddendumDto'];

/** Topes del API (`CreateClinicalEntryAddendumDto`). */
export const ADDENDUM_REASON_MIN = 10;
export const ADDENDUM_REASON_MAX = 500;
export const ADDENDUM_TEXT_MAX = 5000;

/**
 * `GET /patients/:id/medical-history` (and `PUT`) return a plain TS
 * interface on the backend (`MedicalHistory`), not a class decorated with
 * `@ApiProperty()` — same situation as `Patient` in `patients-api.ts` — so
 * the generated `schema.d.ts` has no body shape for these routes
 * (`content?: never`). `MedicalHistory` (imported above) mirrors
 * `dentalix-api`'s
 * `src/modules/medical-history/domain/entities/medical-history.entity.ts` —
 * keep it in sync if that changes.
 *
 * This is APPEND-ONLY: "the current anamnesis" = the row with the highest
 * `version` for a patient. Saving never updates a previous row.
 */
export type { MedicalHistory };

/**
 * `GET /patients/:id/clinical-entries` (and `POST`) — same situation as
 * `MedicalHistory` above. Mirrors
 * `src/modules/clinical-entries/domain/entities/clinical-entry.entity.ts`.
 *
 * This is IMMUTABLE (DX-038): once created, an entry is never updated or
 * deleted — the API answers 405 and the database rejects it. A correction is
 * an addendum (`addenda`, oldest first) that leaves the original intact.
 */
export interface ClinicalEntry {
  id: string;
  tenantId: string;
  patientId: string;
  entryDate: string;
  reason: string | null;
  notes: string;
  performedById: string | null;
  /** DX-170: cita en la que se documentó (null en las evoluciones sueltas). */
  appointmentId?: string | null;
  /** DX-170: plantilla con la que se redactó (solo procedencia). */
  templateId?: string | null;
  /** DX-170: la cita ligada, para «Cita del dd/mm · Dra. X». */
  appointment?: ClinicalEntryAppointment | null;
  createdAt: string;
  addenda: ClinicalEntryAddendum[];
}

export type ClinicalEntryAppointment = components['schemas']['ClinicalEntryAppointmentDto'];

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

// DX-038: corrige una evolución con una adenda; el original no cambia.
export async function createClinicalEntryAddendum(
  token: string,
  patientId: string,
  entryId: string,
  input: CreateClinicalEntryAddendumInput,
): Promise<ClinicalEntryAddendum> {
  return apiFetch<ClinicalEntryAddendum>(
    `/patients/${patientId}/clinical-entries/${entryId}/addenda`,
    { method: 'POST', body: input, token },
  );
}

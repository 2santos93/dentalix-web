import { apiFetch } from '@/lib/api/client';

/**
 * `POST /patients/:id/tooth-records`, `GET /patients/:id/odontogram` and
 * `GET /patients/:id/teeth/:fdi/history` return plain TS interfaces on the
 * backend (`ToothRecord`, `ToothGroup`), not classes decorated with
 * `@ApiProperty()` — same situation as `Patient`/`MedicalHistory` in
 * `patients-api.ts`/`clinical-api.ts` — so the generated `schema.d.ts` has
 * no body shape for these routes. Hand-written to mirror
 * `dentalix-api`'s odontogram module entities — keep in sync if that
 * changes.
 */
export type ToothSurface = 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'VESTIBULAR' | 'LINGUAL';

export interface ToothRecord {
  id: string;
  toothNumber: string;
  surfaces: ToothSurface[];
  kind: 'DIAGNOSIS' | 'PROCEDURE';
  catalogItemId?: string | null;
  status: 'PLANNED' | 'COMPLETED';
  notes?: string | null;
  recordedAt: string;
  /** Links this record to the clinical entry it was created from, if any. */
  clinicalEntryId?: string | null;
  /** The practitioner who performed/recorded this, if tracked. */
  performedById?: string | null;
  createdAt?: string;
}

/** One tooth's records as returned by `GET /patients/:id/odontogram` (ASC by `recordedAt`). */
export interface ToothGroup {
  toothNumber: string;
  records: ToothRecord[];
}

export interface AddToothRecordInput {
  toothNumber: string;
  surfaces: ToothSurface[];
  kind: 'DIAGNOSIS' | 'PROCEDURE';
  catalogItemId?: string;
  status: 'PLANNED' | 'COMPLETED';
  notes?: string;
  /** Links the created record to a clinical entry (backend CreateToothRecordDto). */
  clinicalEntryId?: string;
}

export async function addToothRecord(
  token: string,
  patientId: string,
  input: AddToothRecordInput,
): Promise<ToothRecord> {
  return apiFetch<ToothRecord>(`/patients/${patientId}/tooth-records`, {
    method: 'POST',
    body: input,
    token,
  });
}

// Returned per-tooth group, records ASC by `recordedAt` within each group
// (backend contract) — `projectOdontogram` relies on this ordering.
export async function getOdontogram(token: string, patientId: string): Promise<ToothGroup[]> {
  return apiFetch<ToothGroup[]>(`/patients/${patientId}/odontogram`, { token });
}

// Returned DESC by `recordedAt` (backend contract) — this is the tooth's
// history timeline, most recent first.
export async function getToothTimeline(
  token: string,
  patientId: string,
  fdi: string,
): Promise<ToothRecord[]> {
  return apiFetch<ToothRecord[]>(`/patients/${patientId}/teeth/${fdi}/history`, { token });
}

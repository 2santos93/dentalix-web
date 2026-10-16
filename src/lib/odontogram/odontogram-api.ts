import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { DentitionReason, DentitionType } from './dentition';

/**
 * DX-120: dentición y anulación usan los tipos generados de Swagger
 * (`DentitionDto`…); el resto sigue escrito a mano.
 *
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

/** DX-120: hecho en esta clínica, ya presente al llegar u obra de otro profesional. */
export type ToothRecordOrigin = 'THIS_CLINIC' | 'PRE_EXISTING' | 'OTHER_PROVIDER';

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
  /** DX-120: THIS_CLINIC si el backend no lo manda (registros anteriores). */
  origin?: ToothRecordOrigin;
  /** DX-120: si no es nulo, este registro es la ANULACIÓN de ese id. */
  voidsRecordId?: string | null;
  voidReason?: string | null;
}

/** DX-120: la anulación de un registro, vista desde el anulado. */
export interface ToothRecordVoid {
  id: string;
  reason: string;
  performedById: string | null;
  performedByName: string | null;
  recordedAt: string;
}

/**
 * DX-120: entrada del historial (`teeth/:fdi/history`): incluye los
 * anulados, con su anulación, y el nombre de quien registró.
 */
export interface ToothTimelineEntry extends ToothRecord {
  performedByName?: string | null;
  void?: ToothRecordVoid | null;
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
  /** DX-120: THIS_CLINIC si se omite. */
  origin?: ToothRecordOrigin;
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
// DX-120: con `asOf` (YYYY-MM-DD), la carta tal como estaba al final de ese día.
export async function getOdontogram(
  token: string,
  patientId: string,
  asOf?: string,
): Promise<ToothGroup[]> {
  return apiFetch<ToothGroup[]>(`/patients/${patientId}/odontogram${asOfQuery(asOf)}`, { token });
}

function asOfQuery(asOf?: string): string {
  return asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
}

// Returned DESC by `recordedAt` (backend contract) — this is the tooth's
// history timeline, most recent first.
export async function getToothTimeline(
  token: string,
  patientId: string,
  fdi: string,
): Promise<ToothTimelineEntry[]> {
  return apiFetch<ToothTimelineEntry[]>(`/patients/${patientId}/teeth/${fdi}/history`, { token });
}

/** DX-120: dentición de cada posición (por eventos o por la edad). */
export type DentitionView = components['schemas']['DentitionDto'];
export type PositionDentition = components['schemas']['PositionDentitionDto'];

export async function getDentition(
  token: string,
  patientId: string,
  asOf?: string,
): Promise<DentitionView> {
  return apiFetch<DentitionView>(`/patients/${patientId}/dentition${asOfQuery(asOf)}`, { token });
}

export interface RecordDentitionInput {
  positions: string[];
  dentition: DentitionType;
  reason: DentitionReason;
}

export async function recordDentitionEvents(
  token: string,
  patientId: string,
  input: RecordDentitionInput,
): Promise<components['schemas']['DentitionEventDto'][]> {
  return apiFetch(`/patients/${patientId}/dentition-events`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** Tope del motivo de anulación (el mismo que la API). */
export const VOID_REASON_MAX = 500;

/** DX-120: anula un registro con motivo (autor o ADMIN; la API lo comprueba). */
export async function voidToothRecord(
  token: string,
  patientId: string,
  recordId: string,
  reason: string,
): Promise<ToothRecord> {
  return apiFetch<ToothRecord>(`/patients/${patientId}/tooth-records/${recordId}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

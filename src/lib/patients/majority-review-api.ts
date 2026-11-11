import { apiFetch } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';
import type { ResponsibleRelationship } from './responsible-parties-api';

// DX-342: paso a la mayoría de edad. Un paciente que llegó a la mayoría de edad
// de la clínica con un responsable añadido cuando era menor deja de mandar sus
// avisos y recibos al responsable hasta que recepción o ADMIN lo revisa.
//
// TODO(DX-342): derive from schema.d.ts after codegen — la API se hace en
// paralelo y el contrato aún no está en el esquema generado.
export type MajorityReviewStatus = 'NOT_APPLICABLE' | 'PENDING' | 'REVIEWED';
export type MajorityReviewDecision = 'PATIENT_SELF' | 'KEEP_RESPONSIBLE';

export interface MajorityReviewResponsible {
  id: string;
  name: string;
  relationship: ResponsibleRelationship;
  receivesNotices: boolean;
  isPayer: boolean;
}

export interface MajorityReviewView {
  status: MajorityReviewStatus;
  majorityDate: string | null;
  decision: MajorityReviewDecision | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  responsibles: MajorityReviewResponsible[];
  /** La mayoría de edad de la clínica con la que se calculó (si la API la manda). */
  majorityAge?: number;
}

export interface ComingOfAgeItem {
  patientId: string;
  fullName: string;
  patientCode: string;
  birthDate: string;
  majorityDate: string;
  majorityAge: number;
  status: MajorityReviewStatus;
  overdue: boolean;
  responsiblesCount: number;
}

export interface ComingOfAgeList {
  from: string;
  to: string;
  majorityAge: number;
  restrictedToLocations: boolean;
  items: ComingOfAgeItem[];
}

export interface MajorityReviewInput {
  decision: MajorityReviewDecision;
  note?: string;
}

/** La lista «Cumplen la mayoría de edad»: bajo Pacientes, sin entrada propia en el menú. */
export const COMING_OF_AGE_HREF = '/patients/mayoria-de-edad';

/** Tope de la nota de la revisión (lo mismo valida la API). */
export const MAJORITY_REVIEW_NOTE_MAX = 500;

/**
 * Quién revisa: los roles del cobro y del mostrador (ADMIN y RECEPTION, igual
 * que el `@Roles` de la API). Solo decide qué se pinta; la API lo vuelve a exigir.
 */
export function canReviewMajority(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** `GET /patients/coming-of-age?from&to&locationId?` — ADMIN y RECEPTION. */
export function listComingOfAge(
  token: string,
  range: { from: string; to: string; locationId?: string | null },
): Promise<ComingOfAgeList> {
  const search = new URLSearchParams({ from: range.from, to: range.to });
  if (range.locationId) search.set('locationId', range.locationId);
  return apiFetch<ComingOfAgeList>(`/patients/coming-of-age?${search.toString()}`, { token });
}

/** `GET /patients/:id/majority-review` — el estado de la revisión de un paciente. */
export function getMajorityReview(token: string, patientId: string): Promise<MajorityReviewView> {
  return apiFetch<MajorityReviewView>(`/patients/${encodeURIComponent(patientId)}/majority-review`, { token });
}

/** `POST /patients/:id/majority-review` — ADMIN y RECEPTION; 409/422 si es menor o no tiene responsables. */
export function submitMajorityReview(
  token: string,
  patientId: string,
  input: MajorityReviewInput,
): Promise<MajorityReviewView> {
  return apiFetch<MajorityReviewView>(`/patients/${encodeURIComponent(patientId)}/majority-review`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * Los años que cumplió: los de la vista si los trae; si no, la diferencia de
 * años entre la fecha de mayoría de edad y la de nacimiento (días civiles).
 */
export function reachedAge(view: Pick<MajorityReviewView, 'majorityAge' | 'majorityDate'>, birthDate: string | null | undefined): number | null {
  if (typeof view.majorityAge === 'number') return view.majorityAge;
  if (!view.majorityDate || !birthDate) return null;
  const age = Number(view.majorityDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return Number.isFinite(age) && age > 0 ? age : null;
}

/** Primer y último día civil del mes de `day` (`YYYY-MM-DD`), desplazado `offset` meses. */
export function civilMonthRange(day: string, offset = 0): { from: string; to: string } {
  const [y, m] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

/**
 * Orden de la lista: las pendientes vencidas primero (llevan tiempo sin
 * revisar), luego por fecha de mayoría de edad y por nombre.
 */
export function sortComingOfAge(items: readonly ComingOfAgeItem[]): ComingOfAgeItem[] {
  const rank = (i: ComingOfAgeItem) => (i.status === 'PENDING' && i.overdue ? 0 : 1);
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.majorityDate.localeCompare(b.majorityDate) ||
      a.fullName.localeCompare(b.fullName, 'es'),
  );
}

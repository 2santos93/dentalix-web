import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-342: paso a la mayoría de edad. Un paciente que llegó a la mayoría de edad
// de la clínica con un responsable añadido cuando era menor deja de mandar sus
// avisos y recibos al responsable hasta que recepción o ADMIN lo revisa.

type Schemas = components['schemas'];

export type MajorityReviewStatus = Schemas['MajorityReviewStatus'];
export type MajorityReviewDecision = Schemas['MajorityReviewDecision'];
export type MajorityReviewResponsible = Schemas['MajorityReviewResponsibleDto'];
/** `majorityAge`: la mayoría de edad de la clínica con la que se calculó («Cumplió 18 años…»). */
export type MajorityReviewView = Schemas['MajorityReviewViewDto'];
/** `locationName`: la sede de su última cita atendida; `null` sin citas atendidas. */
export type ComingOfAgeItem = Schemas['ComingOfAgeItemDto'];
export type ComingOfAgeList = Schemas['ComingOfAgeListDto'];
export type MajorityReviewInput = Schemas['ReviewMajorityDto'];

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

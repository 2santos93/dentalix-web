import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { TreatmentPlan } from './treatment-plans-api';

export type RejectPlanInput = components['schemas']['RejectTreatmentPlanDto'];
export type CreatePlanAlternativeInput = components['schemas']['CreatePlanAlternativeDto'];
export type PendingFollowUpItem = components['schemas']['PendingFollowUpItemDto'];
export type PendingFollowUpPage = components['schemas']['PendingFollowUpPageDto'];

export interface PendingFollowUpQuery {
  olderThanDays?: number;
  page?: number;
  pageSize?: number;
}

/** `POST /treatment-plans/:id/present` — DRAFT → PRESENTED (400 sin ítems, 409 fuera de borrador). */
export async function presentPlan(token: string, planId: string): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/treatment-plans/${encodeURIComponent(planId)}/present`, {
    method: 'POST',
    token,
  });
}

/** `POST /treatment-plans/:id/reject` — PRESENTED → REJECTED con motivo (OTHER exige nota). */
export async function rejectPlan(
  token: string,
  planId: string,
  input: RejectPlanInput,
): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/treatment-plans/${encodeURIComponent(planId)}/reject`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `POST /treatment-plans/:id/alternatives` — un borrador nuevo en el grupo del
 * plan, con copia de sus ítems (409 si una opción del grupo ya se aceptó).
 */
export async function createPlanAlternative(
  token: string,
  planId: string,
  input: CreatePlanAlternativeInput = {},
): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/treatment-plans/${encodeURIComponent(planId)}/alternatives`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `GET /treatment-plans/pending-follow-up` — presupuestos presentados hace más
 * de N días sin cita futura. La sede activa (`X-Location-Id`) filtra.
 */
export async function listPendingFollowUp(
  token: string,
  query: PendingFollowUpQuery = {},
): Promise<PendingFollowUpPage> {
  const params = new URLSearchParams();
  if (query.olderThanDays !== undefined) params.set('olderThanDays', String(query.olderThanDays));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiFetch<PendingFollowUpPage>(`/treatment-plans/pending-follow-up${qs ? `?${qs}` : ''}`, {
    token,
  });
}

import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Response DTOs are fully @ApiProperty-decorated on the backend
// (PaymentPlansController uses @ApiOkResponse/@ApiCreatedResponse with
// PaymentPlanDto on every route), so the generated schema carries the exact
// wire shape — same convention as PaymentDto/PlanBalanceWithItemsDto in payments-api.ts.
export type PaymentPlan = components['schemas']['PaymentPlanDto'];
export type Installment = components['schemas']['DerivedInstallmentDto'];
export type CreatePaymentPlanInput = components['schemas']['CreatePaymentPlanDto'];

// Defined locally (not derived from the schema) so the section's exhaustive
// Record<InstallmentStatus, …> maps stay sound even if the backend emits
// `status` as a bare `string` rather than an enum literal in the generated
// types. These four values ARE the backend's InstallmentStatus.
export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';
export type Periodicity = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/**
 * `GET /treatment-plans/:id/payment-plan` — the active payment plan with its
 * installments and derived statuses, or `null` when there is no active plan.
 * DX-123 (B-4): the API answers that normal state with 200 and an empty body
 * (never a 404, so the browser console stays clean); a plan that does not
 * exist is still a 404 and throws.
 */
export async function getPaymentPlan(
  token: string,
  planId: string,
): Promise<PaymentPlan | null> {
  return apiFetchOrNull<PaymentPlan>(`/treatment-plans/${planId}/payment-plan`, { token });
}

/** DX-123 (O-2): un plan de cuotas cancelado, con quién, cuándo y por qué. */
export type CancelledPaymentPlan = components['schemas']['CancelledPaymentPlanDto'];

/**
 * `GET /treatment-plans/:id/payment-plan/history` — los planes de cuotas
 * cancelados, del más reciente al más antiguo (lista vacía si ninguno).
 */
export async function listCancelledPaymentPlans(
  token: string,
  planId: string,
): Promise<CancelledPaymentPlan[]> {
  return apiFetch<CancelledPaymentPlan[]>(`/treatment-plans/${planId}/payment-plan/history`, { token });
}

/** `POST /treatment-plans/:id/payment-plan` — creates the schedule; returns the derived view. 409 if one is already active. */
export async function createPaymentPlan(
  token: string,
  planId: string,
  input: CreatePaymentPlanInput,
): Promise<PaymentPlan> {
  return apiFetch<PaymentPlan>(`/treatment-plans/${planId}/payment-plan`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `DELETE /treatment-plans/:id/payment-plan` — cancels the active plan (204,
 * empty body → apiFetchOrNull). DX-092 (SEC-029): el motivo es obligatorio
 * (3–300 caracteres) y queda junto a quién y cuándo lo canceló.
 */
export async function deletePaymentPlan(
  token: string,
  planId: string,
  reason: string,
  /** DX-091: motivo del ADMIN para cancelarlo con cuotas vencidas en un período cerrado. */
  lockOverrideReason?: string,
): Promise<void> {
  await apiFetchOrNull<null>(`/treatment-plans/${planId}/payment-plan`, {
    method: 'DELETE',
    body: { reason, ...(lockOverrideReason ? { lockOverrideReason } : {}) } satisfies CancelPaymentPlanInput,
    token,
  });
}

type CancelPaymentPlanInput = components['schemas']['CancelPaymentPlanDto'];

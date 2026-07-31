import { apiFetch, apiFetchOrNull, ApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Response DTOs are fully @ApiProperty-decorated on the backend
// (PaymentPlansController uses @ApiOkResponse/@ApiCreatedResponse with
// PaymentPlanDto on every route), so the generated schema carries the exact
// wire shape — same convention as PaymentDto/PlanBalanceDto in payments-api.ts.
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
 * installments and derived statuses, or `null` when there is no active plan
 * (the backend 404s for that, a NORMAL state, not an error). Uses `apiFetch`
 * in a try/catch rather than `apiFetchOrNull` (which only tolerates an empty
 * 200 body, not a 404).
 */
export async function getPaymentPlan(
  token: string,
  planId: string,
): Promise<PaymentPlan | null> {
  try {
    return await apiFetch<PaymentPlan>(`/treatment-plans/${planId}/payment-plan`, {
      token,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
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

/** `DELETE /treatment-plans/:id/payment-plan` — cancels the active plan (204, empty body → apiFetchOrNull). */
export async function deletePaymentPlan(token: string, planId: string): Promise<void> {
  await apiFetchOrNull<null>(`/treatment-plans/${planId}/payment-plan`, {
    method: 'DELETE',
    token,
  });
}

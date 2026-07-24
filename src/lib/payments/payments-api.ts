import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type RecordPaymentInput = components['schemas']['RecordPaymentDto'];

// Re-used from the generated OpenAPI schema (`RecordPaymentDto.method` carries
// `@ApiPropertyOptional({ enum: ... })`, mirroring the backend's payment
// method literal union) so it stays in sync without duplicating the literal
// list by hand — same convention as `PaymentMethod` in the (now removed)
// `sales-api.ts` / `TreatmentPlanStatus` in `treatment-plans-api.ts`.
export type PaymentMethod = NonNullable<RecordPaymentInput['method']>;

/**
 * `PaymentDto`/`PlanBalanceDto` are fully `@ApiProperty()`-decorated response
 * DTOs on the backend (`PaymentsController` uses `@ApiOkResponse`/
 * `@ApiCreatedResponse` with them on every route), so the generated
 * `schema.d.ts` already carries the exact wire shape — unlike
 * `TreatmentPlan`, there is no need to hand-type these.
 */
export type Payment = components['schemas']['PaymentDto'];
export type PlanBalance = components['schemas']['PlanBalanceDto'];

/**
 * `POST /treatment-plans/:id/payments` — records an abono (`createdById` is
 * derived server-side from the JWT). `amount`/`currency`/`paidAt` are
 * required; `method`/`notes` are optional.
 */
export async function recordPayment(
  token: string,
  planId: string,
  input: RecordPaymentInput,
): Promise<Payment> {
  return apiFetch<Payment>(`/treatment-plans/${planId}/payments`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /treatment-plans/:id/payments` — active abonos for the plan, DESC by `paidAt`. */
export async function listPayments(token: string, planId: string): Promise<Payment[]> {
  return apiFetch<Payment[]>(`/treatment-plans/${planId}/payments`, {
    token,
  });
}

/**
 * `GET /treatment-plans/:id/balance` — `billable`/`paid`/`balance`, always in
 * `planCurrency` (the backend converts each abono at its own `paidAt` rate
 * when it was recorded in a different currency).
 */
export async function getPlanBalance(token: string, planId: string): Promise<PlanBalance> {
  return apiFetch<PlanBalance>(`/treatment-plans/${planId}/balance`, {
    token,
  });
}

/**
 * `DELETE /payments/:id` — voids the abono (`deletedAt` set on the backend,
 * see `VoidPaymentUseCase`). The route responds `200` with an EMPTY body, so
 * this uses `apiFetchOrNull` — same rationale as `removeItem` in
 * `treatment-plans-api.ts` (and the removed `voidSale` in `sales-api.ts`) —
 * instead of `apiFetch`, which would throw trying to `res.json()` an empty
 * response.
 */
export async function voidPayment(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/payments/${id}`, {
    method: 'DELETE',
    token,
  });
}

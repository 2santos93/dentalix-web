import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type RecordPaymentInput = components['schemas']['RecordPaymentDto'];
export type VoidPaymentInput = components['schemas']['VoidPaymentDto'];

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
 *
 * `idempotencyKey` (UUID) dedups double-submits/retries: the backend returns
 * the EXISTING payment for a replay of the same key instead of creating a
 * second row. The CALLER generates it (once per form-open, stable across
 * retries of the same submit) and passes it here — generating it inside this
 * function would mint a fresh key per call and defeat the dedup.
 */
export async function recordPayment(
  token: string,
  planId: string,
  input: RecordPaymentInput,
  idempotencyKey: string,
): Promise<Payment> {
  return apiFetch<Payment>(`/treatment-plans/${planId}/payments`, {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
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
 * `DELETE /payments/:id` — anula el abono (`deletedAt` en el backend, ver
 * `VoidPaymentUseCase`). El motivo es obligatorio (3–300 caracteres): viaja en
 * el cuerpo y queda guardado junto a quién y cuándo anuló (SEC-013). Recepción
 * solo puede anular abonos suyos del mismo día; si no, 403 con un mensaje que
 * se muestra tal cual. La ruta responde `200` con cuerpo VACÍO, así que usa
 * `apiFetchOrNull` — mismo motivo que `removeItem` en `treatment-plans-api.ts`
 * — en vez de `apiFetch`, que fallaría al hacer `res.json()` de una respuesta
 * vacía.
 */
export async function voidPayment(token: string, id: string, reason: string): Promise<void> {
  await apiFetchOrNull<null>(`/payments/${id}`, {
    method: 'DELETE',
    body: { reason } satisfies VoidPaymentInput,
    token,
  });
}

export type CashPaymentsResponse = components['schemas']['CashPaymentsResponseDto'];
export type CashPayment = components['schemas']['CashPaymentDto'];
export type CashPaymentsQuery = NonNullable<
  paths['/api/v1/payments']['get']['parameters']['query']
>;

/**
 * `GET /payments` — la caja: abonos de la clínica en el período (`from`/`to`
 * días civiles, ambos inclusive), de la sede activa (la cabecera
 * `X-Location-Id` la pone `apiFetch`) o de todas, con el resumen del período
 * por moneda y método. `method`/`page` ausentes no viajan en la query.
 */
export async function listCashPayments(
  token: string,
  params: CashPaymentsQuery,
): Promise<CashPaymentsResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.method) search.set('method', params.method);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  return apiFetch<CashPaymentsResponse>(`/payments?${search.toString()}`, { token });
}

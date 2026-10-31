import { apiFetch, apiFetchOrNull, apiFetchText } from '@/lib/api/client';
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
 * `PaymentDto`/`PlanBalanceWithItemsDto` are fully `@ApiProperty()`-decorated
 * response DTOs on the backend (`PaymentsController` uses `@ApiOkResponse`/
 * `@ApiCreatedResponse` with them on every route), so the generated
 * `schema.d.ts` already carries the exact wire shape — unlike
 * `TreatmentPlan`, there is no need to hand-type these.
 */
export type Payment = components['schemas']['PaymentDto'];
export type PlanBalance = components['schemas']['PlanBalanceWithItemsDto'];
/** Cobrado y pendiente de un ítem del plan (DX-051), en la moneda del plan. */
export type PlanItemBalance = components['schemas']['PlanItemBalanceDto'];

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

export type RecordSplitPaymentInput = components['schemas']['RecordSplitPaymentDto'];
export type SplitPaymentLineInput = components['schemas']['SplitPaymentLineDto'];
export type SplitPayment = components['schemas']['SplitPaymentDto'];

/** DX-390: líneas de un cobro dividido (con una sola es un abono de siempre). */
export const SPLIT_MAX_LINES = 5;

/** DX-390: 409 del cobro cuyo total supera lo pendiente sin confirmar el saldo a favor. */
export const SPLIT_PAYMENT_EXCEEDS_BALANCE = 'SPLIT_PAYMENT_EXCEEDS_BALANCE';
/** Revisión DX-390: otro abono entró al plan entre la lectura de lo pendiente y el cobro (409). */
export const SPLIT_PAYMENT_BALANCE_CHANGED = 'SPLIT_PAYMENT_BALANCE_CHANGED';

/**
 * `POST /treatment-plans/:id/split-payments` (DX-390): un cobro en 2–5 formas
 * de pago, cada una un abono, con UN recibo y en una sola transacción. Una
 * Idempotency-Key para el cobro entero.
 */
export async function recordSplitPayment(
  token: string,
  planId: string,
  input: RecordSplitPaymentInput,
  idempotencyKey: string,
): Promise<SplitPayment> {
  return apiFetch<SplitPayment>(`/treatment-plans/${planId}/split-payments`, {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/**
 * `POST /opening-balances/:id/payments` (DX-262): abono contra el saldo
 * migrado del paciente, con su recibo de caja; en la moneda del saldo y sin
 * pasar de lo pendiente (400 en español si no).
 */
export async function recordOpeningBalancePayment(
  token: string,
  openingBalanceId: string,
  input: RecordPaymentInput,
  idempotencyKey: string,
): Promise<Payment> {
  return apiFetch<Payment>(`/opening-balances/${openingBalanceId}/payments`, {
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
 * when it was recorded in a different currency). Desde DX-051 trae también lo
 * imputado por ítem (`items[]`), lo «sin imputar» y los abonos sin convertir o
 * fijados a mano. Solo ADMIN y recepción: al resto, 403.
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
 * por moneda y método. `method`/`paymentMethodId`/`page` ausentes no viajan
 * en la query.
 */
export async function listCashPayments(
  token: string,
  params: CashPaymentsQuery,
): Promise<CashPaymentsResponse> {
  const search = cashSearch(params);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  return apiFetch<CashPaymentsResponse>(`/payments?${search.toString()}`, { token });
}

export type CashPaymentsCsvQuery = NonNullable<
  paths['/api/v1/payments.csv']['get']['parameters']['query']
>;

/**
 * `GET /payments.csv` (DX-395) — la caja del período en CSV, con medio y
 * referencia: mismos filtros y sede que `listCashPayments`, sin paginar. La
 * API lo construye (UTF-8 con BOM, celdas protegidas contra fórmulas).
 */
export function downloadCashPaymentsCsv(token: string, params: CashPaymentsCsvQuery): Promise<string> {
  return apiFetchText(`/payments.csv?${cashSearch(params).toString()}`, { token });
}

/** Período, método y medio (DX-395); los ausentes no viajan en la query. */
function cashSearch(params: CashPaymentsCsvQuery): URLSearchParams {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.method) search.set('method', params.method);
  if (params.paymentMethodId) search.set('paymentMethodId', params.paymentMethodId);
  return search;
}

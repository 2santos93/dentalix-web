import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Imputación de un abono a los ítems de su plan (DX-051). Los DTOs de
 * `PaymentAllocationsController` están decorados con `@ApiProperty()`, así que
 * el `schema.d.ts` generado ya trae la forma exacta del cable.
 */
export type PaymentAllocations = components['schemas']['PaymentAllocationsDto'];
export type PaymentAllocationsWithPrevious = components['schemas']['ReplacedPaymentAllocationsDto'];
export type ReplacePaymentAllocationsInput = components['schemas']['ReplacePaymentAllocationsDto'];

/**
 * `GET /payments/:id/allocations` — las líneas vivas del abono, los ítems
 * imputables con lo que admite cada uno sin contar este abono, y la `version`
 * que el PUT reenvía. ADMIN y recepción.
 */
export async function getPaymentAllocations(token: string, paymentId: string): Promise<PaymentAllocations> {
  return apiFetch<PaymentAllocations>(`/payments/${paymentId}/allocations`, { token });
}

/**
 * `PUT /payments/:id/allocations` (solo ADMIN) — `MANUAL` sustituye todas las
 * imputaciones del abono por `allocations` y lo fija; `AUTO` lo desfija y lo
 * reparte como un abono más (sin `allocations`). `expectedVersion` es la
 * `version` leída con GET: si otra edición, una liberación o un reparto la
 * cambiaron, 409 con un mensaje en español. Sin `Idempotency-Key`: reenviar
 * el mismo cuerpo deja el mismo resultado.
 */
export async function replacePaymentAllocations(
  token: string,
  paymentId: string,
  body: ReplacePaymentAllocationsInput,
): Promise<PaymentAllocationsWithPrevious> {
  return apiFetch<PaymentAllocationsWithPrevious>(`/payments/${paymentId}/allocations`, {
    method: 'PUT',
    body,
    token,
  });
}

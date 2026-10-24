import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CancellationFeeView = components['schemas']['CancellationFeeViewDto'];

/**
 * Límites de la API (DX-291): motivo de la condonación (y de la anulación,
 * SEC-050) de 3 a 500 caracteres.
 */
export const WAIVE_REASON_MIN = 3;
export const WAIVE_REASON_MAX = 500;

/**
 * `GET /appointments/:id/cancellation-fee` — estado del cargo por
 * inasistencia o cancelación tardía (ADMIN y RECEPTION).
 */
export function getCancellationFee(token: string, appointmentId: string): Promise<CancellationFeeView> {
  return apiFetch<CancellationFeeView>(`/appointments/${encodeURIComponent(appointmentId)}/cancellation-fee`, {
    token,
  });
}

/**
 * `POST /appointments/:id/cancellation-fee` — genera el cargo (ítem DONE en el
 * plan «Cargos administrativos»). Sin `amount`, el sugerido; nunca por encima.
 */
export function chargeCancellationFee(
  token: string,
  appointmentId: string,
  amount?: number,
): Promise<CancellationFeeView> {
  return apiFetch<CancellationFeeView>(`/appointments/${encodeURIComponent(appointmentId)}/cancellation-fee`, {
    method: 'POST',
    body: amount === undefined ? {} : { amount },
    token,
  });
}

/** `POST /appointments/:id/cancellation-fee/waive` — condona con motivo. */
export function waiveCancellationFee(
  token: string,
  appointmentId: string,
  reason: string,
): Promise<CancellationFeeView> {
  return apiFetch<CancellationFeeView>(
    `/appointments/${encodeURIComponent(appointmentId)}/cancellation-fee/waive`,
    { method: 'POST', body: { reason }, token },
  );
}

/**
 * `POST /appointments/:id/cancellation-fee/void` (SEC-050) — anula un cargo ya
 * generado, con motivo: es la única forma; desde el plan su ítem no se toca.
 */
export function voidCancellationFee(
  token: string,
  appointmentId: string,
  reason: string,
): Promise<CancellationFeeView> {
  return apiFetch<CancellationFeeView>(
    `/appointments/${encodeURIComponent(appointmentId)}/cancellation-fee/void`,
    { method: 'POST', body: { reason }, token },
  );
}

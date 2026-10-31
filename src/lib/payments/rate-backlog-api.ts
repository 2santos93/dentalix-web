import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/** DX-380: abonos sin tasa de más de 24 h (recuento y desde cuándo, sin datos del paciente). */
export type RateBacklog = components['schemas']['PaymentRateBacklogDto'];

/** El aviso es solo del ADMIN, como la tasa de cambio a la que lleva. */
export function canSeeRateBacklog(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getRateBacklog(token: string): Promise<RateBacklog> {
  return apiFetch<RateBacklog>('/payments/rate-backlog', { token });
}

/**
 * DX-402: cuántos abonos sin tasa de un día necesitan la tasa de esa moneda,
 * y si el proveedor ya tiene la tasa de ese día. Para el aviso del formulario
 * de tasa manual cuando el día es anterior a «manual desde».
 */
export type RateBacklogDay = components['schemas']['PaymentRateBacklogDayDto'];

export function getRateBacklogDay(token: string, date: string, currency: string): Promise<RateBacklogDay> {
  const query = new URLSearchParams({ date, currency });
  return apiFetch<RateBacklogDay>(`/payments/rate-backlog/day?${query.toString()}`, { token });
}

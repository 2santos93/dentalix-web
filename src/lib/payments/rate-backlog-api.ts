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

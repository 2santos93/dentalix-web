import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CancellationPolicyVersion = components['schemas']['CancellationPolicyVersionDto'];
export type CancellationPolicy = components['schemas']['CancellationPolicyDto'];
export type CancellationPolicyInput = components['schemas']['CreateCancellationPolicyDto'];

/** Límites de la API (DX-279): horas de aviso 0–168 y texto de 1000. */
export const NOTICE_HOURS_MIN = 0;
export const NOTICE_HOURS_MAX = 168;
export const PATIENT_TEXT_MAX = 1000;

/** `GET /locations/:id/cancellation-policy` — la vigente y el historial (solo ADMIN). */
export function getCancellationPolicy(token: string, locationId: string): Promise<CancellationPolicy> {
  return apiFetch<CancellationPolicy>(
    `/locations/${encodeURIComponent(locationId)}/cancellation-policy`,
    { token },
  );
}

/**
 * `POST /locations/:id/cancellation-policy` — guarda la versión siguiente; la
 * anterior no cambia (solo ADMIN; queda auditado).
 */
export function createCancellationPolicyVersion(
  token: string,
  locationId: string,
  input: CancellationPolicyInput,
): Promise<CancellationPolicyVersion> {
  return apiFetch<CancellationPolicyVersion>(
    `/locations/${encodeURIComponent(locationId)}/cancellation-policy`,
    { method: 'POST', body: input, token },
  );
}

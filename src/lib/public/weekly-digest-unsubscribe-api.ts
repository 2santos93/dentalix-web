import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type PublicWeeklyDigestUnsubscribe = components['schemas']['PublicWeeklyDigestUnsubscribeDto'];

/**
 * `GET /public/weekly-digest-unsubscribe/:token` (DX-568): lo que ve quien abre
 * «Dejar de recibir este resumen» del email. Público: sin sesión; `apiFetch`
 * manda `X-Tenant-Host` con el host de la página. Solo lee: abrir no da de baja.
 */
export function getWeeklyDigestUnsubscribe(token: string): Promise<PublicWeeklyDigestUnsubscribe> {
  return apiFetch<PublicWeeklyDigestUnsubscribe>(`/public/weekly-digest-unsubscribe/${encodeURIComponent(token)}`);
}

/** `POST /public/weekly-digest-unsubscribe/:token`: confirmar la baja (idempotente; responde `ALREADY_OUT`). */
export function confirmWeeklyDigestUnsubscribe(token: string): Promise<PublicWeeklyDigestUnsubscribe> {
  return apiFetch<PublicWeeklyDigestUnsubscribe>(`/public/weekly-digest-unsubscribe/${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}

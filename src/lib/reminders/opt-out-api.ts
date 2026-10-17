import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type PublicReminderOptOut = components['schemas']['PublicReminderOptOutDto'];

/**
 * `GET /public/reminder-opt-outs/:token` (DX-128) — lo que ve el paciente al
 * abrir el enlace de baja del email. Público: sin sesión; `apiFetch` manda
 * `X-Tenant-Host` con el host de la página. Solo lee: abrir no da de baja.
 */
export async function getPublicReminderOptOut(token: string): Promise<PublicReminderOptOut> {
  return apiFetch<PublicReminderOptOut>(`/public/reminder-opt-outs/${encodeURIComponent(token)}`);
}

/** `POST /public/reminder-opt-outs/:token` — confirmar la baja (idempotente). */
export async function confirmPublicReminderOptOut(token: string): Promise<PublicReminderOptOut> {
  return apiFetch<PublicReminderOptOut>(`/public/reminder-opt-outs/${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}

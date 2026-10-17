import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

export type SupportAccess = components['schemas']['SupportAccessDto'];
export type SupportAccessesPage = components['schemas']['SupportAccessesPageDto'];

// Mismo `@Roles` que `GET /support-accesses` en la API: solo ADMIN.
const SUPPORT_ACCESS_READ_ROLES: readonly ClinicRole[] = ['ADMIN'];

/** Si el rol puede ver los accesos de soporte. Solo decide qué se PINTA. */
export function canReadSupportAccesses(role: ClinicRole | null): boolean {
  return role !== null && SUPPORT_ACCESS_READ_ROLES.includes(role);
}

/**
 * `GET /support-accesses` (SEC-008): accesos de soporte (break-glass) de
 * Dentalix a la clínica, más reciente primero, paginados por cursor.
 */
export async function listSupportAccesses(
  token: string,
  query: { limit?: number; cursor?: string | null } = {},
): Promise<SupportAccessesPage> {
  const search = new URLSearchParams();
  if (query.limit) search.set('limit', String(query.limit));
  if (query.cursor) search.set('cursor', query.cursor);
  const qs = search.toString();
  return apiFetch<SupportAccessesPage>(`/support-accesses${qs ? `?${qs}` : ''}`, { token });
}

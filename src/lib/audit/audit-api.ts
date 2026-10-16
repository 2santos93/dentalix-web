import { apiFetch } from '@/lib/api/client';
import type { components, operations } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

export type AuditEvent = components['schemas']['AuditEventDto'];
export type AuditEventsPage = components['schemas']['AuditEventsPageDto'];
export type AuditAction = components['schemas']['AuditAction'];
export type AuditResourceType = components['schemas']['AuditResourceType'];
export type AuditEventsQuery = NonNullable<
  operations['AuditEventsController_list']['parameters']['query']
>;

// Mismo `@Roles` que `GET /audit-events` (AUDIT_READ_ROLES en la API): el
// registro lleva IP y user agent de cada acceso, que solo ve ADMIN.
const AUDIT_READ_ROLES: readonly ClinicRole[] = ['ADMIN'];

/** Si el rol puede abrir la auditoría. Solo decide qué se PINTA. */
export function canReadAuditLog(role: ClinicRole | null): boolean {
  return role !== null && AUDIT_READ_ROLES.includes(role);
}

/**
 * `GET /audit-events` (DX-009): más reciente primero, paginado por cursor
 * (`nextCursor`). Sin `from`/`to` la API devuelve los últimos 30 días.
 */
export async function listAuditEvents(
  token: string,
  query: AuditEventsQuery,
): Promise<AuditEventsPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return apiFetch<AuditEventsPage>(`/audit-events${qs ? `?${qs}` : ''}`, { token });
}

import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-211: los tipos salen del contrato generado (la API los documenta con
// @ApiProperty).
export type Chair = components['schemas']['ChairDto'];
export type ChairSummary = components['schemas']['ChairSummaryDto'];
export type CreateChairInput = components['schemas']['CreateChairDto'];
export type UpdateChairInput = components['schemas']['UpdateChairDto'];

/** Crear, editar, ordenar y desactivar sillones: solo ADMIN (como la API). */
export function canManageChairs(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * `GET /chairs?locationId`: por defecto solo los activos (el selector de la
 * cita y las columnas); `includeInactive` para la gestión y para nombrar el
 * sillón desactivado de una cita.
 */
export async function listChairs(
  token: string,
  locationId: string,
  params: { includeInactive?: boolean } = {},
): Promise<Chair[]> {
  const search = new URLSearchParams({ locationId });
  if (params.includeInactive) search.set('includeInactive', 'true');
  return apiFetch<Chair[]>(`/chairs?${search.toString()}`, { token });
}

export async function createChair(token: string, input: CreateChairInput): Promise<Chair> {
  return apiFetch<Chair>('/chairs', { method: 'POST', body: input, token });
}

export async function updateChair(
  token: string,
  id: string,
  input: UpdateChairInput,
): Promise<Chair> {
  return apiFetch<Chair>(`/chairs/${id}`, { method: 'PATCH', body: input, token });
}

/** Desactivar (no se borra) o reactivar. */
export async function setChairActive(token: string, id: string, active: boolean): Promise<Chair> {
  return apiFetch<Chair>(`/chairs/${id}/${active ? 'reactivate' : 'deactivate'}`, {
    method: 'POST',
    token,
  });
}

/** El orden de las columnas: TODOS los sillones de la sede, cada uno una vez. */
export async function reorderChairs(
  token: string,
  locationId: string,
  chairIds: string[],
): Promise<Chair[]> {
  return apiFetch<Chair[]>('/chairs/order', {
    method: 'PUT',
    body: { locationId, chairIds },
    token,
  });
}

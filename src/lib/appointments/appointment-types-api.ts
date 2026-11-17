import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-121: la API documenta las respuestas con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type AppointmentType = components['schemas']['AppointmentTypeDto'];
export type AppointmentTypeSummary = components['schemas']['AppointmentTypeSummaryDto'];
export type CreateAppointmentTypeInput = components['schemas']['CreateAppointmentTypeDto'];
export type UpdateAppointmentTypeInput = components['schemas']['UpdateAppointmentTypeDto'];

/** Crear, editar, desactivar y retirar tipos: solo ADMIN (como la API). */
export function canManageAppointmentTypes(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * `GET /appointment-types`: por defecto solo los activos (el selector del
 * formulario); `includeInactive` para la pantalla de gestión.
 */
export async function listAppointmentTypes(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<AppointmentType[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<AppointmentType[]>(`/appointment-types${query}`, { token });
}

/**
 * DX-564: `GET /appointment-types/:id`: un tipo, también desactivado o
 * retirado (las citas lo conservan y sus indicaciones se siguen enviando). Los
 * 4 roles. 404 si no es de esta clínica.
 */
export async function getAppointmentType(token: string, id: string): Promise<AppointmentType> {
  return apiFetch<AppointmentType>(`/appointment-types/${encodeURIComponent(id)}`, { token });
}

export async function createAppointmentType(
  token: string,
  input: CreateAppointmentTypeInput,
): Promise<AppointmentType> {
  return apiFetch<AppointmentType>('/appointment-types', {
    method: 'POST',
    body: input,
    token,
  });
}

export async function updateAppointmentType(
  token: string,
  id: string,
  input: UpdateAppointmentTypeInput,
): Promise<AppointmentType> {
  return apiFetch<AppointmentType>(`/appointment-types/${id}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/**
 * Borrado lógico: el tipo sale de la gestión; las citas que lo usan, no
 * cambian. La API responde 204 sin cuerpo.
 */
export async function deleteAppointmentType(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/appointment-types/${id}`, { method: 'DELETE', token });
}

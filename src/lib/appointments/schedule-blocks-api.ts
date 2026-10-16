import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-122: la API documenta los bloqueos con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type ScheduleBlock = components['schemas']['ScheduleBlockDto'];
export type CreateScheduleBlockInput = components['schemas']['CreateScheduleBlockDto'];
export type AffectedAppointment = components['schemas']['AffectedAppointmentDto'];
/** Las primeras 50 citas afectadas por hora y cuántas hay en total. */
export type AffectedAppointmentsPage = components['schemas']['AffectedAppointmentsPageDto'];

/**
 * Quién crea, cambia y retira bloqueos (como la API): ADMIN y recepción, y el
 * odontólogo solo su propia agenda (la API responde 403 a lo demás). La
 * asistente los ve, pero no los crea.
 */
export function canWriteScheduleBlocks(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION' || role === 'DENTIST';
}

/** El odontólogo no elige profesional ni bloquea la sede: solo su agenda. */
export function blocksOwnAgendaOnly(role: ClinicRole | null): boolean {
  return role === 'DENTIST';
}

/** `GET /schedule-blocks?from&to[&locationId][&providerIds]` (máx. 92 días). */
export async function listScheduleBlocks(
  token: string,
  params: { from: string; to: string; locationId?: string; providerIds?: string[] },
): Promise<ScheduleBlock[]> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.locationId) search.set('locationId', params.locationId);
  for (const id of params.providerIds ?? []) search.append('providerIds', id);
  return apiFetch<ScheduleBlock[]>(`/schedule-blocks?${search.toString()}`, { token });
}

/** Citas vivas que quedarían dentro de un bloqueo (antes de confirmarlo). */
export async function listAffectedAppointments(
  token: string,
  params: { start: string; end: string; providerId?: string; locationId?: string },
): Promise<AffectedAppointmentsPage> {
  const search = new URLSearchParams({ start: params.start, end: params.end });
  if (params.providerId) search.set('providerId', params.providerId);
  if (params.locationId) search.set('locationId', params.locationId);
  return apiFetch<AffectedAppointmentsPage>(
    `/schedule-blocks/affected-appointments?${search.toString()}`,
    { token },
  );
}

/** 409 si hay citas dentro y no viene `confirmAffected: true` (no se tocan). */
export async function createScheduleBlock(
  token: string,
  input: CreateScheduleBlockInput,
): Promise<ScheduleBlock> {
  return apiFetch<ScheduleBlock>('/schedule-blocks', { method: 'POST', body: input, token });
}

/** Borrado lógico; la API responde 204 sin cuerpo. */
export async function deleteScheduleBlock(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/schedule-blocks/${id}`, { method: 'DELETE', token });
}

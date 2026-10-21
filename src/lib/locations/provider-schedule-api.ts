import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-233: horario de cada profesional por sede, excepciones por fecha,
// cuadrante y modo estricto. Los tipos salen tal cual del contrato generado.
export type ProviderSchedule = components['schemas']['ProviderScheduleDto'];
export type ProviderLocationSchedule = components['schemas']['ProviderLocationScheduleDto'];
export type ReplaceProviderScheduleInput = components['schemas']['ReplaceProviderScheduleDto'];
export type ProviderOverride = components['schemas']['ProviderOverrideDto'];
/**
 * La API documenta `note` sin `type: String` y el generador lo deja como
 * objeto vacío: se corrige aquí (es texto de hasta 200 caracteres o null).
 */
export type SetProviderOverrideInput = Omit<components['schemas']['SetProviderOverrideDto'], 'note'> & {
  note?: string | null;
};
export type SetProviderOverrideResult = components['schemas']['SetProviderOverrideResultDto'];
export type Roster = components['schemas']['RosterDto'];
export type RosterProvider = components['schemas']['RosterProviderDto'];
export type RosterDay = components['schemas']['RosterDayDto'];
export type RosterLocation = components['schemas']['RosterLocationDto'];
export type ProviderScheduleSettings = components['schemas']['ProviderScheduleSettingsDto'];
/** Un tramo `[startMinute, endMinute)` en minutos de pared de la sede. */
export type MinuteRangeDto = components['schemas']['MinuteRangeDto'];

/** Solo ADMIN cambia horarios, excepciones y el modo estricto (como la API). */
export function canEditProviderSchedules(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /providers/:id/schedule` — su semana en todas sus sedes. */
export async function getProviderSchedule(
  token: string,
  providerId: string,
): Promise<ProviderSchedule> {
  return apiFetch<ProviderSchedule>(`/providers/${providerId}/schedule`, { token });
}

/** `PUT /providers/:id/schedule` — el horario COMPLETO (todas sus sedes). */
export async function replaceProviderSchedule(
  token: string,
  providerId: string,
  input: ReplaceProviderScheduleInput,
): Promise<ProviderSchedule> {
  return apiFetch<ProviderSchedule>(`/providers/${providerId}/schedule`, {
    method: 'PUT',
    body: input,
    token,
  });
}

/** `GET /providers/:id/schedule-overrides` (por defecto, de ayer a dos años vista). */
export async function listProviderOverrides(
  token: string,
  providerId: string,
): Promise<ProviderOverride[]> {
  return apiFetch<ProviderOverride[]>(`/providers/${providerId}/schedule-overrides`, { token });
}

/** Crea o reemplaza la excepción de una sede y fecha; sin tramos = «no trabaja». */
export async function setProviderOverride(
  token: string,
  providerId: string,
  input: SetProviderOverrideInput,
): Promise<SetProviderOverrideResult> {
  return apiFetch<SetProviderOverrideResult>(`/providers/${providerId}/schedule-overrides`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** Quita una excepción (vuelve a regir el semanal). 204 sin cuerpo. */
export async function deleteProviderOverride(
  token: string,
  providerId: string,
  overrideId: string,
): Promise<void> {
  await apiFetchOrNull<null>(`/providers/${providerId}/schedule-overrides/${overrideId}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * `GET /schedule/roster` — cada profesional que atiende × día. Con
 * `locationId`, cada día trae `worksAtLocation` y `locationRanges` (la agenda).
 */
export async function getRoster(
  token: string,
  params: { weekStart: string; days?: number; locationId?: string | null },
): Promise<Roster> {
  const search = new URLSearchParams({ weekStart: params.weekStart });
  if (params.days !== undefined) search.set('days', String(params.days));
  if (params.locationId) search.set('locationId', params.locationId);
  return apiFetch<Roster>(`/schedule/roster?${search.toString()}`, { token });
}

/** `GET /schedule/settings` — modo estricto de la clínica. */
export async function getProviderScheduleSettings(
  token: string,
): Promise<ProviderScheduleSettings> {
  return apiFetch<ProviderScheduleSettings>('/schedule/settings', { token });
}

/** `PUT /schedule/settings` — activa o quita el modo estricto. Solo ADMIN. */
export async function updateProviderScheduleSettings(
  token: string,
  input: ProviderScheduleSettings,
): Promise<ProviderScheduleSettings> {
  return apiFetch<ProviderScheduleSettings>('/schedule/settings', {
    method: 'PUT',
    body: input,
    token,
  });
}

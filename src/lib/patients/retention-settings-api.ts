import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

export type RetentionSettings = components['schemas']['RetentionSettingsDto'];
export type RetentionSettingsUpdateResult = components['schemas']['RetentionSettingsUpdateResultDto'];
export type SaveRetentionSettingsInput = components['schemas']['UpdateRetentionSettingsDto'];

/** Code del 409 de una reducción sin confirmar (DX-330, R5): pide el segundo paso. */
export const RETENTION_REDUCTION_UNCONFIRMED = 'RETENTION_REDUCTION_UNCONFIRMED';
/** Code del 409 de otra operación en curso sobre los pacientes de la clínica (DX-330, R9). */
export const RETENTION_SETTINGS_BUSY = 'RETENTION_SETTINGS_BUSY';

/** El plazo de conservación de la clínica lo cambia solo ADMIN (la API también lo exige). */
export function canManageRetentionSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getRetentionSettings(token: string): Promise<RetentionSettings> {
  return apiFetch<RetentionSettings>('/patients/retention/settings', { token });
}

export function saveRetentionSettings(
  token: string,
  input: SaveRetentionSettingsInput,
): Promise<RetentionSettingsUpdateResult> {
  return apiFetch<RetentionSettingsUpdateResult>('/patients/retention/settings', {
    method: 'PUT',
    body: input,
    token,
  });
}

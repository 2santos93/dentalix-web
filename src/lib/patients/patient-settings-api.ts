import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

export type PatientSettings = components['schemas']['PatientSettingsDto'];

/**
 * Edades del selector de Ajustes › Mayoría de edad (DX-328). Espejan los
 * límites de la API (de 14 a 21, con CHECK en la BD).
 */
export const MAJORITY_AGE_OPTIONS: readonly number[] = [14, 15, 16, 17, 18, 19, 20, 21];

/** La mayoría de edad de la clínica la cambia solo ADMIN (la API también lo exige). */
export function canManagePatientSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getPatientSettings(token: string): Promise<PatientSettings> {
  return apiFetch<PatientSettings>('/patients/settings', { token });
}

export function savePatientSettings(token: string, input: PatientSettings): Promise<PatientSettings> {
  return apiFetch<PatientSettings>('/patients/settings', {
    method: 'PUT',
    body: input,
    token,
  });
}

import { apiFetch } from '@/lib/api/client';

export interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  /** País de la sede (DX-013): decide los campos legales de la receta. */
  country: 'CO' | 'ES';
  /** DX-212: código de habilitación REPS (12 dígitos) o null. */
  repsHabilitationCode?: string | null;
  isActive: boolean;
  /**
   * Zona IANA de la sede (DX-097): la de su horario o, sin horario, la de su
   * país. Decide qué es «hoy» en la caja y el dashboard.
   */
  timeZone: string;
  createdAt: string;
}

/** `GET /locations` — sedes de la clínica, la principal primero. */
export async function listLocations(token: string): Promise<ClinicLocation[]> {
  return apiFetch<ClinicLocation[]>('/locations', { token });
}

/** DX-212: 12 dígitos, el formato que valida la API. */
export const REPS_PATTERN = /^\d{12}$/;

/**
 * `PATCH /locations/:id` — código de habilitación REPS (solo ADMIN; queda
 * auditado). `null` lo quita.
 */
export async function updateLocationReps(
  token: string,
  locationId: string,
  repsHabilitationCode: string | null,
): Promise<ClinicLocation> {
  return apiFetch<ClinicLocation>(`/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    body: { repsHabilitationCode },
    token,
  });
}

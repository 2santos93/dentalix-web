import { apiFetch } from '@/lib/api/client';

export interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  /** País de la sede (DX-013): decide los campos legales de la receta. */
  country: 'CO' | 'ES';
  /** DX-212: código de habilitación REPS (12 dígitos) o null. */
  repsHabilitationCode?: string | null;
  /**
   * DX-222: teléfono de la sede para las indicaciones postoperatorias, con
   * indicativo de país. TODO(DX-222 T12): sustituir por el tipo generado.
   */
  phone?: string | null;
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

/** DX-222: el teléfono admite hasta 40 caracteres (límite de la API). */
export const LOCATION_PHONE_MAX_LENGTH = 40;

/**
 * `PATCH /locations/:id` — teléfono de la sede (solo ADMIN). Vacío lo quita
 * (`null`). Las sedes se crean fuera de la web; aquí solo se edita.
 */
export async function updateLocationPhone(
  token: string,
  locationId: string,
  phone: string | null,
): Promise<ClinicLocation> {
  return apiFetch<ClinicLocation>(`/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    body: { phone },
    token,
  });
}

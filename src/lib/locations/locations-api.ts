import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  /** País de la sede (DX-013): decide los campos legales de la receta. */
  country: 'CO' | 'ES';
  /** DX-319: nº de registro sanitario (texto libre, sin formato por país) o null. */
  healthRegistrationNumber?: components['schemas']['LocationDto']['healthRegistrationNumber'];
  /** DX-319: si el nº sale en los documentos de la sede (por defecto no). */
  showHealthRegistrationNumber?: components['schemas']['LocationDto']['showHealthRegistrationNumber'];
  /**
   * DX-222: teléfono de la sede para las indicaciones postoperatorias, con
   * indicativo de país.
   */
  phone?: components['schemas']['LocationDto']['phone'];
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

/** DX-319: el nº de registro sanitario admite hasta 64 caracteres (límite de la API). */
export const HEALTH_REGISTRATION_NUMBER_MAX_LENGTH = 64;

type HealthRegistrationPatch = Pick<
  components['schemas']['UpdateLocationDto'],
  'healthRegistrationNumber' | 'showHealthRegistrationNumber'
>;

/**
 * `PATCH /locations/:id` — nº de registro sanitario (texto libre, `null` lo
 * quita) y si sale en los documentos. Solo ADMIN; queda auditado con su antes
 * y después.
 */
export async function updateLocationHealthRegistration(
  token: string,
  locationId: string,
  patch: Required<HealthRegistrationPatch>,
): Promise<ClinicLocation> {
  return apiFetch<ClinicLocation>(`/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    body: patch,
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

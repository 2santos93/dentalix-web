import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Sede de la clínica tal como la devuelve la API (`LocationDto`). G1: moneda
 * (ISO 4217), zona IANA y formato regional (BCP 47) son datos de la sede; en
 * esta fase pueden llegar `null` = sede sin configurar, que la web trata como
 * error recuperable (`SedeConfigError`) y nunca rellena con otro valor.
 * `regionalSettingsReviewedAt` null = asignados al actualizar Dentalix, por
 * revisar (aviso D5).
 */
export type ClinicLocation = components['schemas']['LocationDto'];

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
 * (`null`).
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

export type CreateLocationInput = components['schemas']['CreateLocationDto'];

/**
 * `POST /locations` — alta de sede (solo ADMIN). País, moneda, zona y formato
 * van siempre explícitos (R1, R10); la API la deja revisada.
 */
export async function createLocation(token: string, input: CreateLocationInput): Promise<ClinicLocation> {
  return apiFetch<ClinicLocation>('/locations', { method: 'POST', body: input, token });
}

/**
 * Campos de `PATCH /locations/:id` para el modal de sede. Moneda, zona y
 * formato se tipan aquí como texto: el `UpdateLocationDto` generado los deja
 * sin tipo (`Record<string, never>`).
 */
export type UpdateLocationSettingsInput = Omit<
  components['schemas']['UpdateLocationDto'],
  'currency' | 'timeZone' | 'locale'
> & {
  currency?: string;
  timeZone?: string;
  locale?: string;
};

/**
 * `PATCH /locations/:id` — datos de la sede, incluidos moneda, zona y formato
 * (solo ADMIN, auditado). Cambiar moneda o zona de una sede con historial
 * responde 409 `LOCATION_REGIONAL_CHANGE_UNCONFIRMED` hasta que se reenvía con
 * `confirmRegionalChange: true`; con una caja abierta, 409
 * `LOCATION_REGIONAL_CASH_OPEN`.
 */
export async function updateLocationSettings(
  token: string,
  locationId: string,
  patch: UpdateLocationSettingsInput,
): Promise<ClinicLocation> {
  return apiFetch<ClinicLocation>(`/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

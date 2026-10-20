import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-105: convenios con un pagador (descuento porcentual o lista de precios).
export type Agreement = components['schemas']['AgreementDto'];
export type AgreementKind = components['schemas']['AgreementKind'];

/**
 * El generado declara `percent` como `Record<string, never>` en el alta (el
 * decorador no sabe que es un número), así que las entradas se tipan a mano
 * con el mismo cuerpo que valida la API.
 */
export interface CreateAgreementInput {
  name: string;
  payerId: string;
  kind: AgreementKind;
  percent?: number;
  percentByCategory?: Record<string, number>;
  priceListId?: string;
  locationId?: string;
  validFrom?: string;
  validTo?: string;
  active?: boolean;
}

export type UpdateAgreementInput = components['schemas']['UpdateAgreementDto'];

/** Crear, editar y retirar convenios: solo ADMIN (como la API). */
export function canManageAgreements(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

const base = (id: string) => `/agreements/${encodeURIComponent(id)}`;

/**
 * `GET /agreements`: por defecto solo los activos (selectores);
 * `includeInactive` para la pantalla de gestión.
 */
export async function listAgreements(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<Agreement[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<Agreement[]>(`/agreements${query}`, { token });
}

export async function createAgreement(
  token: string,
  input: CreateAgreementInput,
): Promise<Agreement> {
  return apiFetch<Agreement>('/agreements', { method: 'POST', body: input, token });
}

export async function updateAgreement(
  token: string,
  id: string,
  patch: UpdateAgreementInput,
): Promise<Agreement> {
  return apiFetch<Agreement>(base(id), { method: 'PATCH', body: patch, token });
}

/** Retira el convenio (204 sin cuerpo). 409 si hay pacientes asignados. */
export async function deleteAgreement(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(base(id), { method: 'DELETE', token });
}

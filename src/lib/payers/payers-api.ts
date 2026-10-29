import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-153: catálogo de pagadores de la clínica (DX-326: tipos genéricos, sin
// país). Las formas salen del contrato generado.
export type Payer = components['schemas']['PayerDto'];
export type PayerType = components['schemas']['PayerType'];
export type CreatePayerInput = components['schemas']['CreatePayerDto'];
export type UpdatePayerInput = components['schemas']['UpdatePayerDto'];

/** Editar, desactivar y retirar pagadores: solo ADMIN (como la API). */
export function canManagePayers(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Crear un pagador desde la ficha del paciente: ADMIN y RECEPTION. */
export function canCreatePayer(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/**
 * `GET /payers`: por defecto solo los activos (selectores); `includeInactive`
 * para la pantalla de gestión.
 */
export async function listPayers(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<Payer[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<Payer[]>(`/payers${query}`, { token });
}

export async function createPayer(token: string, input: CreatePayerInput): Promise<Payer> {
  return apiFetch<Payer>('/payers', { method: 'POST', body: input, token });
}

export async function updatePayer(
  token: string,
  id: string,
  patch: UpdatePayerInput,
): Promise<Payer> {
  return apiFetch<Payer>(`/payers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * Retira el pagador (204 sin cuerpo). La API responde 409 con un mensaje en
 * español si aún tiene coberturas vivas.
 */
export async function deletePayer(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/payers/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

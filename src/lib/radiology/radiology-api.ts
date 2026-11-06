import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-544: los tipos salen del contrato generado (la API los documenta con
// @ApiProperty).
type Schemas = components['schemas'];
export type RadiologyRecord = Schemas['RadiologyRecordDto'];
export type RadiologyRecordList = Schemas['ListRadiologyRecordsResponseDto'];
export type CreateRadiologyRecordInput = Schemas['CreateRadiologyRecordDto'];
export type UpdateRadiologyRecordInput = Schemas['UpdateRadiologyRecordDto'];
export type RadiologyRecordKind = Schemas['RadiologyRecordKind'];
export type RadiologyLicenseCategory = Schemas['RadiologyLicenseCategory'];
export type RadiologyRecordStatus = Schemas['RadiologyRecordStatus'];
export type RadiologyDue = Schemas['RadiologyDueResponseDto'];
export type RadiologyDueItem = Schemas['RadiologyDueItemDto'];
export type RadiologyStatusFilter = 'LIVE' | 'VOIDED' | 'ALL';

/** El expediente de rayos X lo leen odontología y administración (como la API). */
export function canReadRadiology(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

/** Registrar, editar y anular: solo ADMIN (como la API). */
export function canManageRadiology(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export const RADIOLOGY_KIND_LABELS = {
  LICENSE: 'Licencia',
  QUALITY_CONTROL: 'Control de calidad',
} as const satisfies Record<RadiologyRecordKind, string>;

export const RADIOLOGY_CATEGORY_LABELS = {
  I: 'Categoría I (periapical)',
  II: 'Categoría II (panorámica o tomografía)',
} as const satisfies Record<RadiologyLicenseCategory, string>;

/** La pantalla de Ajustes (DX-544). */
export const RADIOLOGY_HREF = '/settings/rayos-x';

export interface ListRadiologyParams {
  status?: RadiologyStatusFilter;
  kind?: RadiologyRecordKind;
  page?: number;
  pageSize?: number;
}

/**
 * `GET /radiology-records`: del vencimiento más próximo al más lejano. La sede
 * viaja en `X-Location-Id` (apiFetch, el selector global); sin ella, las
 * permitidas.
 */
export async function listRadiologyRecords(
  token: string,
  params: ListRadiologyParams = {},
): Promise<RadiologyRecordList> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.kind) search.set('kind', params.kind);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiFetch<RadiologyRecordList>(`/radiology-records${qs ? `?${qs}` : ''}`, { token });
}

/**
 * `GET /radiology-records/due`: los vencidos o que vencen en ≤90 días, sin los
 * renovados, de lo más urgente a lo menos, en la sede del selector global.
 */
export async function getRadiologyDue(token: string, params: { limit?: number } = {}): Promise<RadiologyDue> {
  const qs = params.limit ? `?limit=${params.limit}` : '';
  return apiFetch<RadiologyDue>(`/radiology-records/due${qs}`, { token });
}

export async function createRadiologyRecord(
  token: string,
  input: CreateRadiologyRecordInput,
): Promise<RadiologyRecord> {
  return apiFetch<RadiologyRecord>('/radiology-records', { method: 'POST', body: input, token });
}

export async function updateRadiologyRecord(
  token: string,
  id: string,
  input: UpdateRadiologyRecordInput,
): Promise<RadiologyRecord> {
  return apiFetch<RadiologyRecord>(`/radiology-records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** Anular con motivo (no se borra: sigue en el expediente, marcado). */
export async function voidRadiologyRecord(token: string, id: string, reason: string): Promise<RadiologyRecord> {
  return apiFetch<RadiologyRecord>(`/radiology-records/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

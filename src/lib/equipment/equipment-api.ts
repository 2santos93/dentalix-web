import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-542: los tipos salen del contrato generado (la API los documenta con
// @ApiProperty).
type Schemas = components['schemas'];
export type Equipment = Schemas['EquipmentDto'];
export type EquipmentDetail = Schemas['EquipmentDetailDto'];
export type EquipmentMaintenance = Schemas['EquipmentMaintenanceDto'];
export type EquipmentList = Schemas['ListEquipmentResponseDto'];
export type CreateEquipmentInput = Schemas['CreateEquipmentDto'];
export type UpdateEquipmentInput = Schemas['UpdateEquipmentDto'];
export type RecordMaintenanceInput = Schemas['RecordMaintenanceDto'];
export type EquipmentCategory = Schemas['EquipmentCategory'];
export type EquipmentRiskClass = Schemas['EquipmentRiskClass'];
export type MaintenanceKind = Schemas['EquipmentMaintenanceKind'];
export type EquipmentStatusFilter = 'ACTIVE' | 'RETIRED' | 'ALL';
// DX-543: los avisos de mantenimiento de «Mi día».
export type MaintenanceDue = Schemas['EquipmentMaintenanceDueResponseDto'];
export type MaintenanceDueItem = Schemas['EquipmentMaintenanceDueItemDto'];

/** Equipos biomédicos: solo ADMIN los ve y los gestiona (como la API). */
export function canManageEquipment(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Nombres de los tipos, en el orden del selector. */
export const EQUIPMENT_CATEGORY_LABELS = {
  AUTOCLAVE: 'Autoclave',
  DENTAL_UNIT: 'Unidad dental',
  XRAY: 'Rayos X',
  COMPRESSOR: 'Compresor',
  CURING_LIGHT: 'Lámpara de fotocurado',
  ULTRASONIC_SCALER: 'Ultrasonido',
  OTHER: 'Otro',
} as const satisfies Record<EquipmentCategory, string>;

/** Clasificación por riesgo (texto neutro, sin la norma de un país). */
export const EQUIPMENT_RISK_LABELS = {
  I: 'Clase I',
  IIA: 'Clase IIa',
  IIB: 'Clase IIb',
  III: 'Clase III',
} as const satisfies Record<EquipmentRiskClass, string>;

export const MAINTENANCE_KIND_LABELS = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
  CALIBRATION: 'Calibración',
} as const satisfies Record<MaintenanceKind, string>;

/** Ruta de la hoja de vida en Ajustes y de su vista imprimible. */
export function equipmentHref(id: string): string {
  return `/settings/equipos/${encodeURIComponent(id)}`;
}

export function equipmentPrintHref(id: string): string {
  return `/print/equipment/${encodeURIComponent(id)}`;
}

export interface ListEquipmentParams {
  locationId?: string;
  status?: EquipmentStatusFilter;
  query?: string;
  page?: number;
  pageSize?: number;
}

/** `GET /equipment`: por nombre y paginado; por defecto, los activos. */
export async function listEquipment(token: string, params: ListEquipmentParams = {}): Promise<EquipmentList> {
  const search = new URLSearchParams();
  if (params.locationId) search.set('locationId', params.locationId);
  if (params.status) search.set('status', params.status);
  if (params.query?.trim()) search.set('query', params.query.trim());
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiFetch<EquipmentList>(`/equipment${qs ? `?${qs}` : ''}`, { token });
}

/**
 * DX-543 · `GET /equipment/maintenance-due`: los equipos con el preventivo
 * vencido o que vence en ≤30 días, de lo más urgente a lo menos. La sede viaja
 * en `X-Location-Id` (apiFetch, el selector global); sin ella, las permitidas.
 */
export async function getMaintenanceDue(token: string, params: { limit?: number } = {}): Promise<MaintenanceDue> {
  const qs = params.limit ? `?limit=${params.limit}` : '';
  return apiFetch<MaintenanceDue>(`/equipment/maintenance-due${qs}`, { token });
}

/** La hoja de vida: el equipo y sus mantenimientos en orden cronológico. */
export async function getEquipment(token: string, id: string): Promise<EquipmentDetail> {
  return apiFetch<EquipmentDetail>(`/equipment/${encodeURIComponent(id)}`, { token });
}

export async function createEquipment(token: string, input: CreateEquipmentInput): Promise<Equipment> {
  return apiFetch<Equipment>('/equipment', { method: 'POST', body: input, token });
}

export async function updateEquipment(token: string, id: string, input: UpdateEquipmentInput): Promise<Equipment> {
  return apiFetch<Equipment>(`/equipment/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, token });
}

/** Dar de baja (no se borra ni se reactiva). */
export async function retireEquipment(
  token: string,
  id: string,
  input: { retiredOn?: string; reason: string },
): Promise<Equipment> {
  return apiFetch<Equipment>(`/equipment/${encodeURIComponent(id)}/retire`, { method: 'POST', body: input, token });
}

export async function recordMaintenance(
  token: string,
  equipmentId: string,
  input: RecordMaintenanceInput,
): Promise<EquipmentMaintenance> {
  return apiFetch<EquipmentMaintenance>(`/equipment/${encodeURIComponent(equipmentId)}/maintenances`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** Anular con motivo (no se borra: sigue en la hoja de vida, marcado). */
export async function voidMaintenance(
  token: string,
  equipmentId: string,
  maintenanceId: string,
  reason: string,
): Promise<EquipmentMaintenance> {
  return apiFetch<EquipmentMaintenance>(
    `/equipment/${encodeURIComponent(equipmentId)}/maintenances/${encodeURIComponent(maintenanceId)}/void`,
    { method: 'POST', body: { reason }, token },
  );
}

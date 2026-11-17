import { apiFetch } from '@/lib/api/client';
import { amountText } from '@/lib/money/round';
import type { components } from '@/lib/api/schema';

// DX-017: laboratorio dental (prótesis, coronas, férulas, alineadores). NO es
// «Órdenes externas» (DX-572: estudios de imagen, análisis y especialistas).
// Las formas salen del Swagger de la API (tags dental-labs y lab-orders).
export type DentalLab = components['schemas']['DentalLabDto'];
export type DentalLabService = components['schemas']['DentalLabServiceDto'];
export type CreateDentalLabInput = components['schemas']['CreateDentalLabDto'];
export type UpdateDentalLabInput = components['schemas']['UpdateDentalLabDto'];
export type CreateDentalLabServiceInput = components['schemas']['CreateDentalLabServiceDto'];
export type UpdateDentalLabServiceInput = components['schemas']['UpdateDentalLabServiceDto'];
export type LabOrder = components['schemas']['LabOrderDto'];
export type LabOrderStatus = components['schemas']['LabOrderStatus'];
export type LabOrderPage = components['schemas']['LabOrderPageDto'];
export type CreateLabOrderInput = components['schemas']['CreateLabOrderDto'];
export type UpdateLabOrderInput = components['schemas']['UpdateLabOrderDto'];
export type DueDateSuggestion = components['schemas']['DueDateSuggestionDto'];
export type LabOrderPrint = components['schemas']['LabOrderPrintDto'];

export * from './lab-orders-roles';

/** Topes del contrato (los mismos que valida la API). */
export const LAB_LIMITS = {
  labNameMax: 120,
  contactNameMax: 120,
  phoneMax: 40,
  emailMax: 254,
  notesMax: 1000,
  serviceNameMax: 120,
  leadTimeMin: 0,
  leadTimeMax: 120,
  descriptionMax: 200,
  teethMax: 32,
  shadeMax: 40,
  materialMax: 120,
  instructionsMax: 2000,
  cancelReasonMin: 3,
  cancelReasonMax: 500,
} as const;

/** Orden de los estados en el filtro de la lista. */
export const LAB_ORDER_STATUSES: readonly LabOrderStatus[] = ['DRAFT', 'SENT', 'RECEIVED', 'CHECKED', 'CANCELLED'];

/** Lo que sigue pendiente en la sede: el filtro por defecto de /laboratorio. */
export const LAB_ORDER_OPEN_STATUSES: readonly LabOrderStatus[] = ['DRAFT', 'SENT', 'RECEIVED'];

// ── Catálogo ────────────────────────────────────────────────────────────────

export function listDentalLabs(token: string, opts: { includeInactive?: boolean } = {}): Promise<DentalLab[]> {
  const qs = opts.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<DentalLab[]>(`/dental-labs${qs}`, { token });
}

export function createDentalLab(token: string, input: CreateDentalLabInput): Promise<DentalLab> {
  return apiFetch<DentalLab>('/dental-labs', { method: 'POST', body: input, token });
}

export function updateDentalLab(token: string, labId: string, input: UpdateDentalLabInput): Promise<DentalLab> {
  return apiFetch<DentalLab>(`/dental-labs/${encodeURIComponent(labId)}`, { method: 'PATCH', body: input, token });
}

export function createDentalLabService(
  token: string,
  labId: string,
  input: CreateDentalLabServiceInput,
): Promise<DentalLabService> {
  return apiFetch<DentalLabService>(`/dental-labs/${encodeURIComponent(labId)}/services`, {
    method: 'POST',
    body: input,
    token,
  });
}

export function updateDentalLabService(
  token: string,
  labId: string,
  serviceId: string,
  input: UpdateDentalLabServiceInput,
): Promise<DentalLabService> {
  return apiFetch<DentalLabService>(
    `/dental-labs/${encodeURIComponent(labId)}/services/${encodeURIComponent(serviceId)}`,
    { method: 'PATCH', body: input, token },
  );
}

// ── Órdenes ─────────────────────────────────────────────────────────────────

function orderPath(id: string, suffix = ''): string {
  return `/lab-orders/${encodeURIComponent(id)}${suffix}`;
}

/** `GET /patients/:id/lab-orders` — las más recientes primero. */
export function listPatientLabOrders(
  token: string,
  patientId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<LabOrderPage> {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return apiFetch<LabOrderPage>(`/patients/${encodeURIComponent(patientId)}/lab-orders${query ? `?${query}` : ''}`, {
    token,
  });
}

export function createLabOrder(token: string, patientId: string, input: CreateLabOrderInput): Promise<LabOrder> {
  return apiFetch<LabOrder>(`/patients/${encodeURIComponent(patientId)}/lab-orders`, {
    method: 'POST',
    body: input,
    token,
  });
}

export function getLabOrder(token: string, id: string): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id), { token });
}

export function updateLabOrder(token: string, id: string, input: UpdateLabOrderInput): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id), { method: 'PATCH', body: input, token });
}

export function sendLabOrder(token: string, id: string, dueOn?: string | null): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id, '/send'), { method: 'POST', body: dueOn ? { dueOn } : {}, token });
}

export function receiveLabOrder(token: string, id: string): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id, '/receive'), { method: 'POST', body: {}, token });
}

export function checkLabOrder(token: string, id: string): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id, '/check'), { method: 'POST', body: {}, token });
}

export function cancelLabOrder(token: string, id: string, reason: string): Promise<LabOrder> {
  return apiFetch<LabOrder>(orderPath(id, '/cancel'), { method: 'POST', body: { reason }, token });
}

export function getLabOrderPrint(token: string, id: string): Promise<LabOrderPrint> {
  return apiFetch<LabOrderPrint>(orderPath(id, '/print'), { token });
}

export interface ListLabOrdersParams {
  locationId?: string | null;
  statuses?: readonly LabOrderStatus[];
  labId?: string | null;
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}

/** `GET /lab-orders` — de UNA sede (sin `locationId`, la activa): atrasadas primero. */
export function listLabOrders(token: string, params: ListLabOrdersParams = {}): Promise<LabOrderPage> {
  const qs = new URLSearchParams();
  if (params.locationId) qs.set('locationId', params.locationId);
  for (const status of params.statuses ?? []) qs.append('status', status);
  if (params.labId) qs.set('labId', params.labId);
  if (params.overdue) qs.set('overdue', 'true');
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return apiFetch<LabOrderPage>(`/lab-orders${query ? `?${query}` : ''}`, { token });
}

/** `GET /lab-orders/due-date-suggestion` — la fecha prometida con los días hábiles de la sede. */
export function suggestLabOrderDueDate(
  token: string,
  params: { serviceId: string; locationId?: string | null; from?: string | null },
): Promise<DueDateSuggestion> {
  const qs = new URLSearchParams({ serviceId: params.serviceId });
  if (params.locationId) qs.set('locationId', params.locationId);
  if (params.from) qs.set('from', params.from);
  return apiFetch<DueDateSuggestion>(`/lab-orders/due-date-suggestion?${qs.toString()}`, { token });
}

// ── Presentación ────────────────────────────────────────────────────────────

/** El precio de referencia del servicio (decimal de la API) como importe; `null` sin precio. */
export function referencePriceAmount(service: Pick<DentalLabService, 'referencePrice'>): number | null {
  if (service.referencePrice === null) return null;
  const value = Number(service.referencePrice);
  return Number.isFinite(value) ? value : null;
}

/** El importe leído del campo, como el decimal de 2 cifras que espera la API. */
export function referencePriceText(amount: number): string {
  return amountText(amount, 2);
}

/** «N.º 12». */
export function labOrderNumberLabel(number: number): string {
  return `N.º ${number}`;
}

/** «Corona zirconio · 5 días hábiles». */
export function serviceOptionLabel(service: Pick<DentalLabService, 'name' | 'leadTimeBusinessDays'>): string {
  const days = service.leadTimeBusinessDays;
  return `${service.name} · ${days === 1 ? '1 día hábil' : `${days} días hábiles`}`;
}

/** «3 días de atraso». */
export function daysOverdueLabel(days: number): string {
  return days === 1 ? '1 día de atraso' : `${days} días de atraso`;
}

/** «Dientes 11, 21» / «Diente 16» / null. */
export function teethLabel(teeth: readonly string[]): string | null {
  if (teeth.length === 0) return null;
  return teeth.length === 1 ? `Diente ${teeth[0]}` : `Dientes ${teeth.join(', ')}`;
}

/** Una orden enviada ya no cambia de contenido: se corrige con otra que la sustituye. */
export function isLabOrderContentLocked(order: Pick<LabOrder, 'status'>): boolean {
  return order.status !== 'DRAFT';
}

export interface LabOrderActor {
  canWrite: boolean;
  canSend: boolean;
  canCheck: boolean;
}

export type LabOrderStep = 'send' | 'receive' | 'check' | 'cancel' | 'correct';

/** Los pasos que el rol puede dar sobre la orden, en el orden del menú. */
export function labOrderSteps(order: Pick<LabOrder, 'status'>, actor: LabOrderActor): LabOrderStep[] {
  const steps: LabOrderStep[] = [];
  if (order.status === 'DRAFT' && actor.canSend) steps.push('send');
  if (order.status === 'SENT' && actor.canSend) steps.push('receive');
  if (order.status === 'RECEIVED' && actor.canCheck) steps.push('check');
  if ((order.status === 'SENT' || order.status === 'RECEIVED' || order.status === 'CHECKED') && actor.canWrite) {
    steps.push('correct');
  }
  if (order.status !== 'CANCELLED' && order.status !== 'CHECKED' && actor.canWrite) steps.push('cancel');
  return steps;
}

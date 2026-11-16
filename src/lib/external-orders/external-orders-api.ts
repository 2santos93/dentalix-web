import { apiFetch, apiFetchBlob, type ApiBlob } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-572: órdenes de estudios y referencias a especialistas externos. Los tipos
// salen tal cual del contrato generado (tags external-orders y
// external-order-templates).
export type ExternalOrder = components['schemas']['ExternalOrderDto'];
export type ExternalOrderKind = components['schemas']['ExternalOrderKind'];
export type ExternalOrderStatus = components['schemas']['ExternalOrderStatus'];
export type IssueExternalOrderInput = components['schemas']['IssueExternalOrderDto'];
export type PendingExternalOrder = components['schemas']['PendingExternalOrderDto'];
export type PendingExternalOrdersPage = components['schemas']['PendingExternalOrdersPageDto'];
export type RecipientSuggestion = components['schemas']['RecipientSuggestionDto'];
export type ExternalOrderSettings = components['schemas']['ExternalOrderSettingsDto'];
export type ExternalOrderCopyChannel = components['schemas']['ExternalOrderCopyChannel'];
export type ExternalOrderCopySent = components['schemas']['ExternalOrderCopySentDto'];
export type ExternalOrderTemplate = components['schemas']['ExternalOrderTemplateDto'];
export type CreateExternalOrderTemplateInput = components['schemas']['CreateExternalOrderTemplateDto'];
export type UpdateExternalOrderTemplateInput = components['schemas']['UpdateExternalOrderTemplateDto'];
export type PublicExternalOrderCopy = components['schemas']['PublicExternalOrderCopyDto'];

/** Topes del contrato (los mismos que valida la API). */
export const EXTERNAL_ORDER_LIMITS = {
  recipientMax: 120,
  itemsMax: 20,
  itemMax: 200,
  teethMax: 32,
  noteMax: 1000,
  voidReasonMin: 5,
  voidReasonMax: 500,
  templateNameMax: 80,
  overdueDaysMin: 1,
  overdueDaysMax: 365,
  recipientQueryMax: 120,
} as const;

/** Códigos de error con los que la pantalla hace algo propio. */
export const EXTERNAL_ORDER_TEMPLATE_STALE = 'EXTERNAL_ORDER_TEMPLATE_STALE';
export const EXTERNAL_ORDER_TEMPLATE_DUPLICATE_NAME = 'EXTERNAL_ORDER_TEMPLATE_DUPLICATE_NAME';
export const EXTERNAL_ORDER_COPY_LINK_USED = 'EXTERNAL_ORDER_COPY_LINK_USED';

/** Ruta de la página pública de la copia. */
export const EXTERNAL_ORDER_COPY_PATH = '/orden/copia';

/** Ruta de la lista «Órdenes sin resultado». */
export const PENDING_EXTERNAL_ORDERS_HREF = '/ordenes-sin-resultado';

/** Nombre de cada tipo, como lo lee el personal. */
export const EXTERNAL_ORDER_KIND_LABELS: Record<ExternalOrderKind, string> = {
  IMAGING: 'Imagen',
  LAB: 'Laboratorio clínico',
  SPECIALIST: 'Especialista',
  OTHER: 'Otro',
};

export const EXTERNAL_ORDER_KINDS = Object.keys(EXTERNAL_ORDER_KIND_LABELS) as ExternalOrderKind[];

/** Etiqueta de cada estado (la misma que pinta `StatusBadge kind="externalOrder"`). */
export const EXTERNAL_ORDER_STATUS_LABELS: Record<ExternalOrderStatus, string> = {
  ISSUED: 'Emitida',
  RESULT_RECEIVED: 'Resultado recibido',
  VOIDED: 'Anulada',
};

/** Emitir: DENTIST y ADMIN (la API exige además el registro profesional). */
export function canIssueExternalOrders(role: ClinicRole | null): boolean {
  return role === 'DENTIST' || role === 'ADMIN';
}

/** La nota clínica y el PDF con la nota: los roles clínicos (recepción nunca). */
export function canSeeClinicalNote(role: ClinicRole | null): boolean {
  return role === 'DENTIST' || role === 'ASSISTANT' || role === 'ADMIN';
}

/** Plantillas y plazo: solo ADMIN escribe (Ajustes › Órdenes externas). */
export function canManageExternalOrderSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Lista del paciente y «Órdenes sin resultado»: los cuatro roles. */
export function canReadExternalOrders(role: ClinicRole | null): boolean {
  return role !== null;
}

/**
 * Anula un ADMIN o quien la emitió, y solo una emitida sin resultado. Solo
 * decide qué se PINTA: la API vuelve a comprobarlo (403/409).
 */
export function canVoidExternalOrder(
  order: Pick<ExternalOrder, 'status' | 'issuedById'>,
  actor: { role: ClinicRole | null; userId: string | null },
): boolean {
  if (order.status !== 'ISSUED' || actor.role === null) return false;
  return actor.role === 'ADMIN' || (actor.userId !== null && order.issuedById === actor.userId);
}

/** Desliga un rol clínico o quien lo ligó, y solo con resultado. */
export function canUnlinkExternalOrderResult(
  order: Pick<ExternalOrder, 'status' | 'resultLinkedById'>,
  actor: { role: ClinicRole | null; userId: string | null },
): boolean {
  if (order.status !== 'RESULT_RECEIVED' || actor.role === null) return false;
  return canSeeClinicalNote(actor.role) || (actor.userId !== null && order.resultLinkedById === actor.userId);
}

/** Se envía al paciente una emitida o con resultado; anulada, no. */
export function canSendExternalOrderCopy(order: Pick<ExternalOrder, 'status'>): boolean {
  return order.status !== 'VOIDED';
}

function patientPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/external-orders`;
}

function orderPath(id: string, suffix = ''): string {
  return `/external-orders/${encodeURIComponent(id)}${suffix}`;
}

/** `GET /patients/:id/external-orders` — más reciente primero, anuladas incluidas. */
export function listPatientExternalOrders(token: string, patientId: string): Promise<ExternalOrder[]> {
  return apiFetch<ExternalOrder[]>(patientPath(patientId), { token });
}

/** `POST /patients/:id/external-orders`. Los 400/403/404/409 traen el motivo en español. */
export function issueExternalOrder(
  token: string,
  patientId: string,
  input: IssueExternalOrderInput,
): Promise<ExternalOrder> {
  return apiFetch<ExternalOrder>(patientPath(patientId), { method: 'POST', body: input, token });
}

/** `GET /external-orders/:id/pdf?withNote=` — el PDF con la sesión; con la nota, solo roles clínicos. */
export function fetchExternalOrderPdf(token: string, id: string, withNote: boolean): Promise<ApiBlob> {
  return apiFetchBlob(orderPath(id, `/pdf?withNote=${withNote ? 'true' : 'false'}`), { token });
}

/** `POST /external-orders/:id/void` — motivo obligatorio (5–500). */
export function voidExternalOrder(token: string, id: string, reason: string): Promise<ExternalOrder> {
  return apiFetch<ExternalOrder>(orderPath(id, '/void'), { method: 'POST', body: { reason }, token });
}

/** `POST /external-orders/:id/result` — un documento del mismo paciente, sin anular. */
export function linkExternalOrderResult(token: string, id: string, documentId: string): Promise<ExternalOrder> {
  return apiFetch<ExternalOrder>(orderPath(id, '/result'), { method: 'POST', body: { documentId }, token });
}

/** `POST /external-orders/:id/result/unlink` (sin cuerpo): la orden vuelve a «Emitida». */
export function unlinkExternalOrderResult(token: string, id: string): Promise<ExternalOrder> {
  return apiFetch<ExternalOrder>(orderPath(id, '/result/unlink'), { method: 'POST', token });
}

/**
 * `POST /external-orders/:id/patient-copy`: crea el enlace de un solo uso (el
 * anterior deja de servir). Por EMAIL lo envía la API; por WHATSAPP la
 * respuesta trae el número, el texto y el enlace. 409 anulada o archivado;
 * 422 sin contacto, de baja o menor sin responsable; 429 tope de emails.
 */
export function sendExternalOrderCopy(
  token: string,
  id: string,
  channel: ExternalOrderCopyChannel,
): Promise<ExternalOrderCopySent> {
  return apiFetch<ExternalOrderCopySent>(orderPath(id, '/patient-copy'), { method: 'POST', body: { channel }, token });
}

export interface PendingExternalOrdersQuery {
  locationId: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** `GET /external-orders/pending` — las emitidas sin resultado de una sede, la más antigua primero. */
export function listPendingExternalOrders(
  token: string,
  query: PendingExternalOrdersQuery,
): Promise<PendingExternalOrdersPage> {
  const search = new URLSearchParams({ locationId: query.locationId });
  if (query.overdueOnly) search.set('overdueOnly', 'true');
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  return apiFetch<PendingExternalOrdersPage>(`/external-orders/pending?${search.toString()}`, { token });
}

/** `GET /external-orders/recipients?q=` — como mucho 10 (roles clínicos). */
export function listRecipientSuggestions(token: string, q: string): Promise<RecipientSuggestion[]> {
  const query = q.trim().slice(0, EXTERNAL_ORDER_LIMITS.recipientQueryMax);
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiFetch<RecipientSuggestion[]>(`/external-orders/recipients${suffix}`, { token });
}

/** `GET /external-orders/settings` — el plazo N (roles clínicos). */
export function getExternalOrderSettings(token: string): Promise<ExternalOrderSettings> {
  return apiFetch<ExternalOrderSettings>('/external-orders/settings', { token });
}

/** `PUT /external-orders/settings` (solo ADMIN). */
export function saveExternalOrderSettings(
  token: string,
  settings: ExternalOrderSettings,
): Promise<ExternalOrderSettings> {
  return apiFetch<ExternalOrderSettings>('/external-orders/settings', { method: 'PUT', body: settings, token });
}

/** `GET /external-order-templates` — por defecto solo las activas; `includeInactive` para Ajustes. */
export function listExternalOrderTemplates(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<ExternalOrderTemplate[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<ExternalOrderTemplate[]>(`/external-order-templates${query}`, { token });
}

export function createExternalOrderTemplate(
  token: string,
  input: CreateExternalOrderTemplateInput,
): Promise<ExternalOrderTemplate> {
  return apiFetch<ExternalOrderTemplate>('/external-order-templates', { method: 'POST', body: input, token });
}

/** PATCH con `version` optimista: si cambió, 409 `EXTERNAL_ORDER_TEMPLATE_STALE`. */
export function updateExternalOrderTemplate(
  token: string,
  id: string,
  input: UpdateExternalOrderTemplateInput,
): Promise<ExternalOrderTemplate> {
  return apiFetch<ExternalOrderTemplate>(`/external-order-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/**
 * `GET /public/external-order-copies/:token`, sin sesión: la clínica sale del
 * host. Abrir NO gasta el enlace. 404 inventado, caducado, invalidado, de una
 * orden anulada o de un paciente archivado.
 */
export function getPublicExternalOrderCopy(linkToken: string): Promise<PublicExternalOrderCopy> {
  return apiFetch<PublicExternalOrderCopy>(`/public/external-order-copies/${encodeURIComponent(linkToken)}`);
}

/**
 * `POST /public/external-order-copies/:token/download`: devuelve el PDF (con la
 * nota) y GASTA el enlace. La segunda vez, 410 `EXTERNAL_ORDER_COPY_LINK_USED`.
 */
export function downloadPublicExternalOrderCopy(linkToken: string): Promise<ApiBlob> {
  return apiFetchBlob(`/public/external-order-copies/${encodeURIComponent(linkToken)}/download`, { method: 'POST' });
}

/** Líneas no vacías, recortadas. */
export function cleanLines(lines: readonly string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l !== '');
}

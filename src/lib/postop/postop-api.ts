import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';
export { whatsAppUrl } from '@/lib/appointments/confirmation-message';

// TODO(DX-222 T12): sustituir por components['schemas'][…] tras npm run codegen
// Hasta entonces los tipos se escriben a mano desde el contrato de la API
// (DX-222 tareas 3 a 5). Los nombres exportados no cambian al regenerar.

export type PostOpChannel = 'PRINT' | 'EMAIL' | 'WHATSAPP_LINK';

export interface PostOpTemplate {
  id: string;
  code: string;
  title: string;
  body: string;
  version: number;
  active: boolean;
  catalogItems: Array<{ id: string; code: string; labelEs: string }>;
  appointmentTypes: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostOpTemplateInput {
  code: string;
  title: string;
  body: string;
  catalogItemIds?: string[];
  appointmentTypeIds?: string[];
}

/** `code` no se edita. Los vínculos, si vienen, se reemplazan completos. */
export interface UpdatePostOpTemplateInput {
  title?: string;
  body?: string;
  active?: boolean;
  catalogItemIds?: string[];
  appointmentTypeIds?: string[];
}

export interface PostOpTemplateSummary {
  id: string;
  code: string;
  title: string;
  version: number;
}

export interface PostOpDeliverySummary {
  id: string;
  patientId: string;
  appointmentId: string;
  templateId: string;
  templateCode: string;
  templateTitle: string;
  templateVersion: number;
  channel: PostOpChannel;
  deliveredAt: string;
  deliveredByName: string;
  recipientMasked: string | null;
  sentToResponsible: boolean;
  firstOpenedAt: string | null;
  linkExpiresAt: string | null;
}

export interface PostOpSuggestions {
  patientId: string;
  suggested: PostOpTemplateSummary[];
  others: PostOpTemplateSummary[];
  email: {
    allowed: boolean;
    reason: string | null;
    toMasked: string | null;
    toResponsible: boolean;
  };
  whatsapp: { phone: string | null; reason: string | null };
  locationPhone: string | null;
  deliveries: PostOpDeliverySummary[];
}

export interface PostOpClinicBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export type PostOpDeliveryDocument = PostOpDeliverySummary & {
  renderedText: string;
  clinic: PostOpClinicBranding;
  locationName: string;
  locationPhone: string | null;
  patientName: string;
};

export interface PostOpDeliveryCreated {
  delivery: PostOpDeliverySummary;
  publicUrl: string | null;
  whatsapp: { phone: string; text: string } | null;
  sentTo: string | null;
  sentToResponsible: boolean;
}

export interface PublicPostOp {
  clinic: PostOpClinicBranding;
  locationPhone: string | null;
  title: string;
  code: string;
  version: number;
  renderedText: string;
  deliveredAt: string;
}

export interface DeliverPostOpInput {
  templateId: string;
  channel: PostOpChannel;
}

/** Variables que admite una plantilla, en el orden en que se ofrecen. */
export const POSTOP_VARIABLES = [
  { key: 'paciente', label: 'Nombre del paciente' },
  { key: 'profesional', label: 'Profesional de la cita' },
  { key: 'clinica', label: 'Nombre de la clínica' },
  { key: 'telefono_sede', label: 'Teléfono de la sede' },
  { key: 'fecha', label: 'Fecha de la cita' },
] as const;

const KNOWN: ReadonlySet<string> = new Set(POSTOP_VARIABLES.map((v) => v.key));
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/** Mismo criterio que la API (render-instructions.ts): sin distinguir mayúsculas. */
export function unknownVariables(body: string): string[] {
  const out = new Set<string>();
  for (const [, raw] of body.matchAll(VARIABLE_PATTERN)) {
    const name = raw.toLowerCase();
    if (!KNOWN.has(name)) out.add(name);
  }
  return [...out];
}

/** Crear, editar y desactivar plantillas: solo ADMIN. Solo decide qué se pinta. */
export function canManagePostOpTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Entregar indicaciones: los cuatro roles. `null` (sin sesión legible) no. */
export function canDeliverPostOp(role: ClinicRole | null): boolean {
  return role !== null;
}

/** `GET /post-op-templates` — `active` filtra; sin él, todas. */
export async function listPostOpTemplates(
  token: string,
  params: { active?: boolean } = {},
): Promise<PostOpTemplate[]> {
  const query = params.active === undefined ? '' : `?active=${params.active}`;
  return apiFetch<PostOpTemplate[]>(`/post-op-templates${query}`, { token });
}

/** `POST /post-op-templates` (ADMIN). 409 si el código existe, 400 si hay variables desconocidas. */
export async function createPostOpTemplate(
  token: string,
  input: CreatePostOpTemplateInput,
): Promise<PostOpTemplate> {
  return apiFetch<PostOpTemplate>('/post-op-templates', { method: 'POST', body: input, token });
}

/** `PATCH /post-op-templates/:id` (ADMIN). */
export async function updatePostOpTemplate(
  token: string,
  id: string,
  input: UpdatePostOpTemplateInput,
): Promise<PostOpTemplate> {
  return apiFetch<PostOpTemplate>(`/post-op-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** `POST /post-op-templates/samples` (ADMIN) — devuelve las plantillas creadas. */
export async function loadSamplePostOpTemplates(token: string): Promise<PostOpTemplate[]> {
  return apiFetch<PostOpTemplate[]>('/post-op-templates/samples', { method: 'POST', token });
}

function appointmentPostOpPath(appointmentId: string): string {
  return `/appointments/${encodeURIComponent(appointmentId)}/post-op-instructions`;
}

/** `GET /appointments/:id/post-op-instructions` — plantillas sugeridas y canales disponibles. */
export async function getAppointmentPostOp(
  token: string,
  appointmentId: string,
): Promise<PostOpSuggestions> {
  return apiFetch<PostOpSuggestions>(appointmentPostOpPath(appointmentId), { token });
}

/**
 * `POST /appointments/:id/post-op-instructions/deliveries` — entrega por el
 * canal elegido. 422 si el paciente no tiene a dónde enviarlo o dio de baja
 * los envíos; 429 si se agotó la cuota de email.
 */
export async function deliverPostOp(
  token: string,
  appointmentId: string,
  input: DeliverPostOpInput,
): Promise<PostOpDeliveryCreated> {
  return apiFetch<PostOpDeliveryCreated>(`${appointmentPostOpPath(appointmentId)}/deliveries`, {
    method: 'POST',
    body: input,
    token,
  });
}

function patientDeliveriesPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/post-op-deliveries`;
}

/** `GET /patients/:id/post-op-deliveries` — de la más reciente a la más antigua. */
export async function listPatientPostOpDeliveries(
  token: string,
  patientId: string,
): Promise<PostOpDeliverySummary[]> {
  return apiFetch<PostOpDeliverySummary[]>(patientDeliveriesPath(patientId), { token });
}

/** `GET /patients/:id/post-op-deliveries/:id` — el documento con el texto entregado. */
export async function getPatientPostOpDelivery(
  token: string,
  patientId: string,
  id: string,
): Promise<PostOpDeliveryDocument> {
  return apiFetch<PostOpDeliveryDocument>(
    `${patientDeliveriesPath(patientId)}/${encodeURIComponent(id)}`,
    { token },
  );
}

/**
 * `GET /public/post-op-instructions/:token` — lo que ve el paciente. Público:
 * sin `token` de sesión (`apiFetch` manda `X-Tenant-Host`). 404 si el enlace
 * no existe, 410 si venció.
 */
export async function getPublicPostOp(linkToken: string): Promise<PublicPostOp> {
  return apiFetch<PublicPostOp>(`/public/post-op-instructions/${encodeURIComponent(linkToken)}`);
}

/**
 * `POST /public/post-op-instructions/:token/opened` — marca la primera
 * apertura. Responde 204 sin cuerpo y es idempotente.
 */
export async function markPublicPostOpOpened(linkToken: string): Promise<void> {
  await apiFetchOrNull<void>(
    `/public/post-op-instructions/${encodeURIComponent(linkToken)}/opened`,
    { method: 'POST' },
  );
}

/** Ruta de la vista imprimible (fuera del shell). */
export function postOpPrintHref(patientId: string, deliveryId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/indicaciones/${encodeURIComponent(deliveryId)}`;
}

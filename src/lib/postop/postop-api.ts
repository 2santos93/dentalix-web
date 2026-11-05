import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import type { AppointmentStatus } from '@/lib/appointments/appointments-api';
import type { SedeClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
export { whatsAppUrl } from '@/lib/appointments/confirmation-message';

type Schemas = components['schemas'];

// Tipos del cliente generado (`npm run codegen`); los nombres exportados son
// los que usan los componentes.
export type PostOpChannel = Schemas['PostOpDeliveryChannel'];
export type PostOpTemplate = Schemas['PostOpTemplateDto'];
export type CreatePostOpTemplateInput = Schemas['CreatePostOpTemplateDto'];
/** `code` no se edita. Los vínculos, si vienen, se reemplazan completos. */
export type UpdatePostOpTemplateInput = Schemas['UpdatePostOpTemplateDto'];
export type PostOpTemplateSummary = Schemas['PostOpTemplateSummaryDto'];
export type PostOpDeliverySummary = Schemas['PostOpDeliverySummaryDto'];
export type PostOpSuggestions = Schemas['PostOpSuggestionsDto'];
export type PostOpClinicBranding = Schemas['PostOpClinicBrandingDto'];
export type PostOpDeliveryDocument = Schemas['PostOpDeliveryDocumentDto'];
/** `emailQueued` es `false` si la entrega EMAIL quedó registrada pero el email no se encoló. */
export type PostOpDeliveryCreated = Schemas['PostOpDeliveryCreatedDto'];
export type PublicPostOp = Schemas['PublicPostOpDto'];
export type DeliverPostOpInput = Schemas['DeliverPostOpDto'];

/** Variables que admite una plantilla, en el orden en que se ofrecen. */
export const POSTOP_VARIABLES = [
  { key: 'paciente', label: 'Nombre del paciente' },
  { key: 'profesional', label: 'Profesional de la cita' },
  { key: 'clinica', label: 'Nombre de la clínica' },
  { key: 'telefono_sede', label: 'Teléfono de la sede' },
  { key: 'fecha', label: 'Fecha de la cita' },
] as const;

const KNOWN: ReadonlySet<string> = new Set(POSTOP_VARIABLES.map((v) => v.key));
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

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

/** Citas que ya se atienden o se atendieron: su fecha no las hace «futuras». */
const ATTENDED: ReadonlySet<AppointmentStatus> = new Set([
  'COMPLETED',
  'ARRIVED',
  'IN_CHAIR',
  'READY_FOR_CHECKOUT',
]);

/**
 * DX-250: qué se ofrece de las indicaciones en el detalle de una cita.
 * - `none`: nada (ni se monta el panel ni se pide su lista): una cita de un
 *   día civil (en la zona de la sede) que aún no llega y no se atiende.
 * - `readonly`: cancelada o no-show. No se entrega nada, pero lo que ya se
 *   entregó antes de cancelarse se sigue viendo (sin acciones).
 * - `full`: el panel completo.
 * Sin reloj de la sede no se puede saber el día: se ofrece (la API rechaza
 * igual una entrega de una cita futura).
 */
export function postOpPanelMode(
  appointment: { status: AppointmentStatus; start: string },
  clock: SedeClock | null,
  now: Date = new Date(),
): 'full' | 'readonly' | 'none' {
  if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') return 'readonly';
  if (!clock || ATTENDED.has(appointment.status)) return 'full';
  return wallDay(appointment.start, clock.timeZone) <= wallDay(now, clock.timeZone) ? 'full' : 'none';
}

/**
 * DX-250: ¿tiene sentido «Reintentar» tras este fallo al entregar? Solo si
 * el servidor pudo no haber llegado a responder: sin conexión, tiempo agotado
 * o un 5xx (p. ej. el 502 de un balanceador). Un 4xx (422 sin canal o dado de
 * baja, 429 de cuota de email…) vuelve a fallar igual.
 */
export function canRetryDeliver(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof ApiError) return err.status >= 500;
  return err instanceof DOMException && err.name === 'TimeoutError';
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
  /**
   * DX-250: `Idempotency-Key` (UUID) generado una vez por clic y reutilizado
   * en los reintentos: la API devuelve la entrega ya registrada, sin `publicUrl`.
   */
  idempotencyKey?: string,
): Promise<PostOpDeliveryCreated> {
  return apiFetch<PostOpDeliveryCreated>(`${appointmentPostOpPath(appointmentId)}/deliveries`, {
    method: 'POST',
    body: input,
    token,
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
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

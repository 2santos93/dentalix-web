import { ApiError, apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type PatientAccessScope = components['schemas']['PatientAccessScope'];
export type CreatedAccessLink = components['schemas']['CreatedAccessLinkDto'];
export type AccessLink = components['schemas']['AccessLinkDto'];
export type PatientPortal = components['schemas']['PatientPortalDto'];
export type PortalAppointment = components['schemas']['PortalAppointmentDto'];
export type PortalPlan = components['schemas']['PortalPlanDto'];
export type PatientAccessSession = components['schemas']['PatientAccessSessionDto'];
export type AcceptPortalQuoteInput = components['schemas']['AcceptPortalQuoteDto'];

/** Los apartados en el orden canónico de la API (citas, presupuestos, cuenta). */
export const PATIENT_ACCESS_SCOPES: readonly PatientAccessScope[] = ['APPOINTMENTS', 'PLANS', 'ACCOUNT'];

/** El nombre de cada apartado: el mismo en la ficha y en la página del paciente. */
export const PATIENT_ACCESS_SCOPE_LABELS: Record<PatientAccessScope, string> = {
  APPOINTMENTS: 'Citas',
  PLANS: 'Presupuestos',
  ACCOUNT: 'Mi cuenta',
};

/** Validez que ofrece la ficha (la API admite de 1 a 30 días). */
export const PATIENT_ACCESS_TTL_OPTIONS = [7, 14, 30] as const;
export type PatientAccessTtl = (typeof PATIENT_ACCESS_TTL_OPTIONS)[number];
export const PATIENT_ACCESS_DEFAULT_TTL: PatientAccessTtl = 14;

/** Códigos estables de los errores de la página pública (DX-101). */
export const PATIENT_ACCESS_INVALID = 'PATIENT_ACCESS_INVALID';
export const PATIENT_ACCESS_LOCKED = 'PATIENT_ACCESS_LOCKED';
export const PATIENT_ACCESS_SESSION_REQUIRED = 'PATIENT_ACCESS_SESSION_REQUIRED';
export const PATIENT_ACCESS_GONE = 'PATIENT_ACCESS_GONE';
/** DX-101-bis: 409 de aceptar desde el portal (no dice si estaba aceptado, rechazado o vencido). */
export const PORTAL_QUOTE_NOT_ACCEPTABLE = 'PORTAL_QUOTE_NOT_ACCEPTABLE';
/** DX-101-bis: 409 de aceptar: el presupuesto cambió desde que el portal lo mostró. */
export const PORTAL_QUOTE_CHANGED = 'PORTAL_QUOTE_CHANGED';

// --- Personal (ADMIN y recepción, como el estado de cuenta) ------------------

/**
 * `POST /patients/:id/access-links` — crea el enlace. La URL (con el token)
 * viene SOLO en esta respuesta: no se guarda en ningún sitio de la web.
 */
export async function createPatientAccessLink(
  token: string,
  patientId: string,
  input: { scopes: PatientAccessScope[]; ttlDays: number },
): Promise<CreatedAccessLink> {
  return apiFetch<CreatedAccessLink>(`/patients/${encodeURIComponent(patientId)}/access-links`, {
    method: 'POST',
    token,
    body: input,
  });
}

/** `GET /patients/:id/access-links` — los enlaces vivos (ni revocados ni caducados), sin URL. */
export async function listPatientAccessLinks(token: string, patientId: string): Promise<AccessLink[]> {
  return apiFetch<AccessLink[]>(`/patients/${encodeURIComponent(patientId)}/access-links`, { token });
}

/** `DELETE /patients/:id/access-links/:linkId` — revoca (204, idempotente); corta la sesión abierta. */
export async function revokePatientAccessLink(token: string, patientId: string, linkId: string): Promise<void> {
  await apiFetchOrNull<null>(
    `/patients/${encodeURIComponent(patientId)}/access-links/${encodeURIComponent(linkId)}`,
    { method: 'DELETE', token },
  );
}

// --- Página pública del paciente --------------------------------------------
// Sin Bearer: la sesión es la cookie HttpOnly `dentalix_pa` que pone la API en
// `/api/v1/public/patient-access`. `apiFetch` llama por el MISMO origen con
// `credentials: 'same-origin'`, así que viaja sola; la web nunca la lee.

/** `POST /public/patient-access/:token/verify` — la fecha de nacimiento abre la sesión (30 min). */
export async function verifyPatientAccess(linkToken: string, birthDate: string): Promise<PatientAccessSession> {
  return apiFetch<PatientAccessSession>(`/public/patient-access/${encodeURIComponent(linkToken)}/verify`, {
    method: 'POST',
    body: { birthDate },
  });
}

/** `GET /public/patient-access/me` — lo compartido; cada apartado no compartido llega `null`. */
export async function getPatientPortal(): Promise<PatientPortal> {
  return apiFetch<PatientPortal>('/public/patient-access/me');
}

/** `POST /public/patient-access/me/appointments/:id/confirm` — el paciente confirma su cita. */
export async function confirmPortalAppointment(appointmentId: string): Promise<{ status: 'CONFIRMED' }> {
  return apiFetch<{ status: 'CONFIRMED' }>(
    `/public/patient-access/me/appointments/${encodeURIComponent(appointmentId)}/confirm`,
    { method: 'POST' },
  );
}

/**
 * DX-101-bis · `POST /public/patient-access/me/plans/:planId/accept` — el
 * paciente (o su responsable) acepta el presupuesto con su firma. Devuelve el
 * plan del portal ya ACCEPTED (misma lista blanca que `GET me`). El
 * `contentHash` es el del presupuesto que se le mostró: si cambió, 409.
 */
export async function acceptPortalPlan(planId: string, body: AcceptPortalQuoteInput): Promise<PortalPlan> {
  return apiFetch<PortalPlan>(`/public/patient-access/me/plans/${encodeURIComponent(planId)}/accept`, {
    method: 'POST',
    body,
  });
}

/**
 * Qué hacer con un fallo de `acceptPortalPlan` (la pantalla elige el texto):
 * - `session`: 401/410, lo trata el portal como en el resto de acciones.
 * - `changed`: 409 `PORTAL_QUOTE_CHANGED`, se recargan los datos.
 * - `notAcceptable`: cualquier otro 409 (o un 404/403): el texto de la API y se recargan los datos.
 * - `rateLimited`: 429, demasiados intentos seguidos.
 * - `invalid`: 400 de validación (nombre o firma): el texto de la API, en el diálogo.
 * - `failed`: red, 5xx o lo inesperado: reintentar.
 */
export type PortalAcceptFailure = 'session' | 'changed' | 'notAcceptable' | 'rateLimited' | 'invalid' | 'failed';

export function portalAcceptFailure(err: unknown): PortalAcceptFailure {
  if (!(err instanceof ApiError)) return 'failed';
  if (err.status === 401 || err.status === 410) return 'session';
  if (err.status === 409) return err.code === PORTAL_QUOTE_CHANGED ? 'changed' : 'notAcceptable';
  // 404 (no es suyo / no existe) y 403 (el enlace no comparte presupuestos): tampoco se puede.
  if (err.status === 404 || err.status === 403) return 'notAcceptable';
  if (err.status === 429) return 'rateLimited';
  if (err.status === 400) return 'invalid';
  return 'failed';
}

/** `POST /public/patient-access/me/logout` — borra la cookie (204). */
export async function logoutPatientPortal(): Promise<void> {
  await apiFetchOrNull<null>('/public/patient-access/me/logout', { method: 'POST' });
}

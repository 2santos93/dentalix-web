import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type PatientAccessScope = components['schemas']['PatientAccessScope'];
export type CreatedAccessLink = components['schemas']['CreatedAccessLinkDto'];
export type AccessLink = components['schemas']['AccessLinkDto'];
export type PatientPortal = components['schemas']['PatientPortalDto'];
export type PortalAppointment = components['schemas']['PortalAppointmentDto'];
export type PortalPlan = components['schemas']['PortalPlanDto'];
export type PatientAccessSession = components['schemas']['PatientAccessSessionDto'];

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

/** `POST /public/patient-access/me/logout` — borra la cookie (204). */
export async function logoutPatientPortal(): Promise<void> {
  await apiFetchOrNull<null>('/public/patient-access/me/logout', { method: 'POST' });
}

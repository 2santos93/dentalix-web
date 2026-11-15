import { apiFetch, apiFetchBlob, type ApiBlob } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// Los tipos salen tal cual del contrato generado (tag patient-certificates, DX-306).
export type PatientCertificate = components['schemas']['PatientCertificateDto'];
export type CertificateKind = components['schemas']['PatientCertificateKind'];
export type EligibleAppointment = components['schemas']['EligibleAppointmentDto'];
export type IssueCertificateInput = components['schemas']['IssueCertificateDto'];
export type CertificateIssuer = components['schemas']['CertificateIssuerDto'];
export type CertificateSettings = components['schemas']['CertificateSettingsDto'];

/** Máximo de días de reposo que admite el ajuste de la clínica (mismos límites que la API). */
export const CERTIFICATE_REST_MAX_DAYS_MIN = 1;
export const CERTIFICATE_REST_MAX_DAYS_MAX = 365;
/** El inicio del reposo puede ir, como mucho, 30 días después de la atención (API). */
export const CERTIFICATE_REST_START_MAX_OFFSET_DAYS = 30;
/** Motivo de la anulación: 3–500 caracteres (API). */
export const CERTIFICATE_VOID_REASON_MIN = 3;
export const CERTIFICATE_VOID_REASON_MAX = 500;
/** Diagnóstico del reposo: el tope que se deja escribir. */
export const CERTIFICATE_DIAGNOSIS_MAX = 500;

/** Nombre de cada tipo, como lo lee el personal. */
export const CERTIFICATE_KIND_LABELS: Record<CertificateKind, string> = {
  ATTENDANCE: 'Justificante de asistencia',
  REST: 'Certificado de reposo',
};

/** Los ajustes los cambia solo ADMIN (`PUT /certificates/settings`). */
export function canManageCertificateSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * Anula quien lo emitió o un ADMIN, y solo uno vigente. Solo decide qué se
 * PINTA: la API vuelve a comprobarlo (403/409).
 */
export function canVoidCertificate(
  cert: Pick<PatientCertificate, 'voidedAt' | 'issuedById'>,
  actor: { role: ClinicRole | null; userId: string | null },
): boolean {
  if (cert.voidedAt !== null || actor.role === null) return false;
  return actor.role === 'ADMIN' || cert.issuedById === actor.userId;
}

/**
 * Recepción no ve el diagnóstico (`diagnosis` null) y la API le niega el PDF de
 * un reposo que lo lleva impreso (403): no se le ofrece «Imprimir».
 */
export function canPrintCertificate(cert: Pick<PatientCertificate, 'hasDiagnosis' | 'diagnosis'>): boolean {
  return !(cert.hasDiagnosis && cert.diagnosis === null);
}

function patientPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/certificates`;
}

/** `GET /patients/:id/certificates` — más reciente primero, anulados incluidos. */
export async function listPatientCertificates(token: string, patientId: string): Promise<PatientCertificate[]> {
  return apiFetch<PatientCertificate[]>(patientPath(patientId), { token });
}

/** `GET /patients/:id/certificates/appointments` — citas atendidas recientes de las sedes permitidas. */
export async function listCertificateAppointments(token: string, patientId: string): Promise<EligibleAppointment[]> {
  return apiFetch<EligibleAppointment[]>(`${patientPath(patientId)}/appointments`, { token });
}

/** `POST /patients/:id/certificates`. Los 400/403/409 traen el motivo en español. */
export async function issueCertificate(
  token: string,
  patientId: string,
  input: IssueCertificateInput,
): Promise<PatientCertificate> {
  return apiFetch<PatientCertificate>(patientPath(patientId), { method: 'POST', body: input, token });
}

/** `POST /patients/:id/certificates/:certId/void` — motivo obligatorio (3–500). */
export async function voidCertificate(
  token: string,
  patientId: string,
  certificateId: string,
  reason: string,
): Promise<PatientCertificate> {
  return apiFetch<PatientCertificate>(`${patientPath(patientId)}/${encodeURIComponent(certificateId)}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** `GET /patients/:id/certificates/:certId/pdf` — el PDF con la sesión (no es un enlace público). */
export async function fetchCertificatePdf(token: string, patientId: string, certificateId: string): Promise<ApiBlob> {
  return apiFetchBlob(`${patientPath(patientId)}/${encodeURIComponent(certificateId)}/pdf`, { token });
}

/** `GET /certificates/issuer` — qué puede emitir este usuario y su registro profesional. */
export async function getCertificateIssuer(token: string): Promise<CertificateIssuer> {
  return apiFetch<CertificateIssuer>('/certificates/issuer', { token });
}

/** `GET /certificates/settings` — máximo de días de reposo y si imprime el diagnóstico. */
export async function getCertificateSettings(token: string): Promise<CertificateSettings> {
  return apiFetch<CertificateSettings>('/certificates/settings', { token });
}

/** `PUT /certificates/settings` (solo ADMIN). Aplica a la siguiente emisión. */
export async function saveCertificateSettings(
  token: string,
  settings: CertificateSettings,
): Promise<CertificateSettings> {
  return apiFetch<CertificateSettings>('/certificates/settings', { method: 'PUT', body: settings, token });
}

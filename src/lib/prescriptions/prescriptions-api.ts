import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// La API documenta todas las respuestas con @ApiProperty: los tipos salen tal
// cual del contrato generado.
export type Prescription = components['schemas']['PrescriptionDto'];
export type PrescriptionItem = components['schemas']['PrescriptionItemDto'];
export type PrescriptionDocument = components['schemas']['PrescriptionDocumentDto'];
export type PrescriptionIssuer = components['schemas']['PrescriptionIssuerDto'];
export type IssuePrescriptionInput = components['schemas']['IssuePrescriptionDto'];
export type PrescriptionItemInput = components['schemas']['PrescriptionItemInputDto'];
export type PrescriptionTemplate = components['schemas']['PrescriptionTemplateDto'];
export type PrescriptionTemplateItem = components['schemas']['PrescriptionTemplateItemDto'];
export type CreatePrescriptionTemplateInput =
  components['schemas']['CreatePrescriptionTemplateDto'];
export type UpdatePrescriptionTemplateInput =
  components['schemas']['UpdatePrescriptionTemplateDto'];
export type ClinicCountry = components['schemas']['ClinicCountry'];
export type SafetyAlert = components['schemas']['SafetyAlertDto'];
export type SafetyCheckItem = components['schemas']['SafetyCheckItemDto'];
export type PrescriptionSafetyPreview = components['schemas']['PrescriptionSafetyPreviewDto'];
export type PrescriptionStatus = components['schemas']['PrescriptionStatus'];

export const COUNTRY_LABELS: Record<ClinicCountry, string> = {
  CO: 'Colombia',
  ES: 'España',
};

/** Leer recetas: los mismos roles que la API (CLINICAL_ROLES). Recepción no. */
export const PRESCRIPTION_READ_ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];
/** Emitir y anular: quien prescribe (PRESCRIPTION_ISSUE_ROLES en la API). */
export const PRESCRIPTION_ISSUE_ROLES: readonly ClinicRole[] = ['DENTIST', 'ADMIN'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canUsePrescriptions(role: ClinicRole | null): boolean {
  return role !== null && PRESCRIPTION_READ_ROLES.includes(role);
}

export function canIssuePrescriptions(role: ClinicRole | null): boolean {
  return role !== null && PRESCRIPTION_ISSUE_ROLES.includes(role);
}

/** Crear, editar y retirar plantillas (y el país de las sedes): solo ADMIN. */
export function canManagePrescriptionTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * Anula quien la emitió o un ADMIN, y solo una receta aún emitida. Solo decide
 * qué se PINTA: la API vuelve a comprobarlo (403/409).
 */
export function canVoidPrescription(
  rx: { status: PrescriptionStatus; professionalId: string },
  actor: { role: ClinicRole | null; userId: string | null },
): boolean {
  if (rx.status !== 'ISSUED' || !canIssuePrescriptions(actor.role)) return false;
  return actor.role === 'ADMIN' || rx.professionalId === actor.userId;
}

/** `GET /prescriptions/issuer` — país y sede desde los que se emitiría. */
export async function getPrescriptionIssuer(token: string): Promise<PrescriptionIssuer> {
  return apiFetch<PrescriptionIssuer>('/prescriptions/issuer', { token });
}

function patientPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/prescriptions`;
}

/** `GET /patients/:id/prescriptions` — más reciente primero, anuladas incluidas. */
export async function listPatientPrescriptions(
  token: string,
  patientId: string,
): Promise<Prescription[]> {
  return apiFetch<Prescription[]>(patientPath(patientId), { token });
}

/**
 * `POST /patients/:id/prescriptions`. 400 si falta un campo legal del país;
 * 409 si hay avisos de seguridad bloqueantes y no se enviaron
 * `safetyOverride: true` y `safetyOverrideReason` (DX-300).
 */
export async function issuePrescription(
  token: string,
  patientId: string,
  input: IssuePrescriptionInput,
): Promise<Prescription> {
  return apiFetch<Prescription>(patientPath(patientId), { method: 'POST', body: input, token });
}

/**
 * `POST /patients/:id/prescriptions/safety-check` (DX-300) — avisos de
 * seguridad que daría la emisión, calculados en el servidor con la anamnesis
 * vigente. Solo una vista previa: la emisión los vuelve a calcular.
 */
export async function checkPrescriptionSafety(
  token: string,
  patientId: string,
  items: SafetyCheckItem[],
): Promise<PrescriptionSafetyPreview> {
  return apiFetch<PrescriptionSafetyPreview>(`${patientPath(patientId)}/safety-check`, {
    method: 'POST',
    body: { items },
    token,
  });
}

/**
 * Enlace a la ficha técnica de la CIMA (AEMPS) por nº de registro del
 * medicamento, para revisar 4.3 (contraindicaciones), 4.5 (interacciones) y
 * 4.6 (embarazo). Solo lleva el nº de registro: ningún dato del paciente.
 * `null` si el nº no tiene forma de nº de registro.
 */
export function cimaTechnicalSheetUrl(registrationNumber: string): string | null {
  const nregistro = registrationNumber.trim();
  if (!/^\d{4,10}(IP\d{0,4})?$/i.test(nregistro)) return null;
  const n = encodeURIComponent(nregistro.toUpperCase());
  return `https://cima.aemps.es/cima/dochtml/ft/${n}/FT_${n}.html`;
}

/** `GET /prescriptions/:id` — documento completo con `integrityOk`. */
export async function getPrescription(token: string, id: string): Promise<PrescriptionDocument> {
  return apiFetch<PrescriptionDocument>(`/prescriptions/${encodeURIComponent(id)}`, { token });
}

/** `POST /prescriptions/:id/void` — motivo obligatorio. */
export async function voidPrescription(
  token: string,
  id: string,
  reason: string,
): Promise<Prescription> {
  return apiFetch<Prescription>(`/prescriptions/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** `GET /prescription-templates` — las vivas, por nombre. */
export async function listPrescriptionTemplates(token: string): Promise<PrescriptionTemplate[]> {
  return apiFetch<PrescriptionTemplate[]>('/prescription-templates', { token });
}

export async function createPrescriptionTemplate(
  token: string,
  input: CreatePrescriptionTemplateInput,
): Promise<PrescriptionTemplate> {
  return apiFetch<PrescriptionTemplate>('/prescription-templates', {
    method: 'POST',
    body: input,
    token,
  });
}

export async function updatePrescriptionTemplate(
  token: string,
  id: string,
  input: UpdatePrescriptionTemplateInput,
): Promise<PrescriptionTemplate> {
  return apiFetch<PrescriptionTemplate>(`/prescription-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** `DELETE /prescription-templates/:id` — borrado blando; 204 sin cuerpo. */
export async function deletePrescriptionTemplate(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/prescription-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

/** `PATCH /locations/:id` — país de la sede (ADMIN). */
export async function updateLocationCountry(
  token: string,
  locationId: string,
  country: ClinicCountry,
): Promise<void> {
  await apiFetch<unknown>(`/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    body: { country },
    token,
  });
}

/** Ruta de la vista imprimible (fuera del shell). */
export function prescriptionPrintHref(patientId: string, prescriptionId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(prescriptionId)}`;
}

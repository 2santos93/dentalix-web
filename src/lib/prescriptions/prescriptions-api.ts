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
export type PrescriptionLocationFormat = components['schemas']['PrescriptionLocationFormatDto'];
export type PrescriptionSettings = components['schemas']['PrescriptionSettingsDto'];
export type SafetyAlert = components['schemas']['SafetyAlertDto'];
export type SafetyCheckItem = components['schemas']['SafetyCheckItemDto'];
export type PrescriptionSafetyPreview = components['schemas']['PrescriptionSafetyPreviewDto'];
export type PrescriptionStatus = components['schemas']['PrescriptionStatus'];

/** Validez de la receta, en días (ajuste de la clínica; mismos límites y texto que la API). */
export const PRESCRIPTION_VALIDITY_DAYS_MIN = 1;
export const PRESCRIPTION_VALIDITY_DAYS_MAX = 365;
export const PRESCRIPTION_VALIDITY_DAYS_MESSAGE =
  'La validez de la receta tiene que ser un número entero de días entre 1 y 365.';

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

/** Crear, editar y retirar plantillas: solo ADMIN. */
export function canManagePrescriptionTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Cambiar los ajustes de la receta: solo ADMIN (`PUT /prescriptions/settings`). */
export function canManagePrescriptionSettings(role: ClinicRole | null): boolean {
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

/** `GET /prescriptions/issuer` — sede desde la que se emitiría y ajustes de la receta. */
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
 * `POST /patients/:id/prescriptions`. 400 si falta un campo obligatorio;
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

/** `GET /prescriptions/settings`: cantidad en letras, nº de historia clínica y validez. */
export async function getPrescriptionSettings(token: string): Promise<PrescriptionSettings> {
  return apiFetch<PrescriptionSettings>('/prescriptions/settings', { token });
}

/** `PUT /prescriptions/settings` (solo ADMIN). Aplica a las recetas que se emitan desde ahora. */
export async function savePrescriptionSettings(
  token: string,
  settings: PrescriptionSettings,
): Promise<PrescriptionSettings> {
  return apiFetch<PrescriptionSettings>('/prescriptions/settings', {
    method: 'PUT',
    body: settings,
    token,
  });
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

/** Ruta de la vista imprimible (fuera del shell). */
export function prescriptionPrintHref(patientId: string, prescriptionId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(prescriptionId)}`;
}

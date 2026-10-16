import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// La API documenta todas las respuestas con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type ConsentTemplate = components['schemas']['ConsentTemplateDto'];
export type CreateConsentTemplateInput = components['schemas']['CreateConsentTemplateDto'];
export type UpdateConsentTemplateInput = components['schemas']['UpdateConsentTemplateDto'];
export type ConsentPreview = components['schemas']['ConsentPreviewDto'];
export type PatientConsentSummary = components['schemas']['PatientConsentSummaryDto'];
export type PatientConsent = components['schemas']['PatientConsentDto'];
export type PatientConsentDocument = components['schemas']['PatientConsentDocumentDto'];
export type SignPatientConsentInput = components['schemas']['SignPatientConsentDto'];
export type ConsentSignerType = SignPatientConsentInput['signerType'];

/** Variables que admite una plantilla, en el orden en que se ofrecen. */
export const CONSENT_VARIABLES = [
  { key: 'paciente', label: 'Nombre del paciente' },
  { key: 'documento', label: 'Documento del paciente' },
  { key: 'profesional', label: 'Profesional que firma' },
  { key: 'clinica', label: 'Nombre de la clínica' },
  { key: 'fecha', label: 'Fecha de la firma' },
  { key: 'tratamiento', label: 'Procedimientos del plan' },
] as const;

/**
 * Quién firma y lee consentimientos: los mismos roles que la API
 * (CLINICAL_ROLES). Recepción no. Solo decide qué se PINTA; el servidor
 * vuelve a comprobarlo.
 */
export const CONSENT_ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canUseConsents(role: ClinicRole | null): boolean {
  return role !== null && CONSENT_ROLES.includes(role);
}

/** Crear, editar y desactivar plantillas: solo ADMIN. */
export function canManageConsentTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /consent-templates` — `active` filtra; sin él, todas. */
export async function listConsentTemplates(
  token: string,
  params: { active?: boolean } = {},
): Promise<ConsentTemplate[]> {
  const query = params.active === undefined ? '' : `?active=${params.active}`;
  return apiFetch<ConsentTemplate[]>(`/consent-templates${query}`, { token });
}

/** `POST /consent-templates` (ADMIN). 400 si hay variables desconocidas. */
export async function createConsentTemplate(
  token: string,
  input: CreateConsentTemplateInput,
): Promise<ConsentTemplate> {
  return apiFetch<ConsentTemplate>('/consent-templates', { method: 'POST', body: input, token });
}

/**
 * `PATCH /consent-templates/:id` (ADMIN). Cambiar título o texto sube la
 * versión; los consentimientos ya firmados no cambian.
 */
export async function updateConsentTemplate(
  token: string,
  id: string,
  input: UpdateConsentTemplateInput,
): Promise<ConsentTemplate> {
  return apiFetch<ConsentTemplate>(`/consent-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

function consentsPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/consents`;
}

/** `GET /patients/:id/consents` — del más reciente al más antiguo, sin firmas. */
export async function listPatientConsents(
  token: string,
  patientId: string,
): Promise<PatientConsentSummary[]> {
  return apiFetch<PatientConsentSummary[]>(consentsPath(patientId), { token });
}

/** `GET /patients/:id/consents/preview` — el texto con las variables resueltas. */
export async function previewPatientConsent(
  token: string,
  patientId: string,
  params: { templateId: string; treatmentPlanId?: string },
): Promise<ConsentPreview> {
  const search = new URLSearchParams({ templateId: params.templateId });
  if (params.treatmentPlanId) search.set('treatmentPlanId', params.treatmentPlanId);
  return apiFetch<ConsentPreview>(`${consentsPath(patientId)}/preview?${search.toString()}`, {
    token,
  });
}

/**
 * `POST /patients/:id/consents` — firma. 400 sin firma o firma inválida, 409
 * si la plantilla cambió desde la vista previa.
 */
export async function signPatientConsent(
  token: string,
  patientId: string,
  input: SignPatientConsentInput,
): Promise<PatientConsent> {
  return apiFetch<PatientConsent>(consentsPath(patientId), { method: 'POST', body: input, token });
}

/** `GET /patients/:id/consents/:consentId` — documento completo con firmas. */
export async function getPatientConsent(
  token: string,
  patientId: string,
  consentId: string,
): Promise<PatientConsentDocument> {
  return apiFetch<PatientConsentDocument>(
    `${consentsPath(patientId)}/${encodeURIComponent(consentId)}`,
    { token },
  );
}

/** Ruta de la vista imprimible (fuera del shell). */
export function consentPrintHref(patientId: string, consentId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/consents/${encodeURIComponent(consentId)}`;
}

export const SIGNER_TYPE_LABELS: Record<ConsentSignerType, string> = {
  PATIENT: 'Paciente',
  GUARDIAN: 'Tutor/a',
};

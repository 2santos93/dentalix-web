import { statusLabels } from '@/lib/status/tones';
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';
import type { SubmitBody } from './anamnesis-form';

type Schemas = components['schemas'];

// Tipos del cliente generado (`npm run codegen`), DX-099.
export type AnamnesisRequestCreated = Schemas['AnamnesisRequestCreatedDto'];
export type AnamnesisSubmission = Schemas['AnamnesisSubmissionSummaryDto'];
export type AnamnesisSubmissionStatus = Schemas['MedicalHistorySubmissionStatus'];
export type AnamnesisReview = Schemas['AnamnesisReviewDto'];
export type HistoryDiffEntry = Schemas['HistoryDiffEntryDto'];
export type PublicAnamnesis = Schemas['PublicAnamnesisDto'];
export type AnamnesisQuestionnaire = Schemas['AnamnesisQuestionnaireDto'];

/** Estados en la ficha y en la bandeja. */
export const SUBMISSION_STATUS_LABELS: Record<AnamnesisSubmissionStatus, string> = statusLabels('anamnesisSubmission');

/** Ver la bandeja y las respuestas: CLINICAL_ROLES en la API (recepción no). */
export function canSeeAnamnesisInbox(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT';
}

/** Aceptar o rechazar (crea una versión de la HC): ADMIN y DENTIST. */
export function canReviewAnamnesis(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

const patientPath = (patientId: string) =>
  `/patients/${encodeURIComponent(patientId)}/medical-history/requests`;
const submissionPath = (id: string) => `/medical-history/submissions/${encodeURIComponent(id)}`;

/** `POST /patients/:id/medical-history/requests` — la URL llega una sola vez. */
export function createAnamnesisRequest(
  token: string,
  patientId: string,
  input: { appointmentId?: string } = {},
): Promise<AnamnesisRequestCreated> {
  return apiFetch<AnamnesisRequestCreated>(patientPath(patientId), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /patients/:id/medical-history/requests` — estado, sin respuestas. */
export function listPatientAnamnesisRequests(
  token: string,
  patientId: string,
): Promise<AnamnesisSubmission[]> {
  return apiFetch<AnamnesisSubmission[]>(patientPath(patientId), { token });
}

/** `GET /medical-history/submissions?status=` — la bandeja (por sedes). */
export function listAnamnesisInbox(
  token: string,
  status: AnamnesisSubmissionStatus = 'SUBMITTED',
): Promise<AnamnesisSubmission[]> {
  return apiFetch<AnamnesisSubmission[]>(`/medical-history/submissions?status=${status}`, { token });
}

/** `GET /medical-history/submissions/summary` — el contador del menú. */
export function getAnamnesisInboxSummary(token: string): Promise<{ submitted: number }> {
  return apiFetch<{ submitted: number }>('/medical-history/submissions/summary', { token });
}

export function getAnamnesisReview(token: string, id: string): Promise<AnamnesisReview> {
  return apiFetch<AnamnesisReview>(submissionPath(id), { token });
}

/** Aceptar; con `medicalHistory`, los ajustes del profesional en vez de la propuesta. */
export function acceptAnamnesis(
  token: string,
  id: string,
  medicalHistory?: ClinicalHistoryValue,
): Promise<AnamnesisSubmission> {
  return apiFetch<AnamnesisSubmission>(`${submissionPath(id)}/accept`, {
    method: 'POST',
    body: medicalHistory ? { medicalHistory } : {},
    token,
  });
}

export function rejectAnamnesis(token: string, id: string, reason: string): Promise<AnamnesisSubmission> {
  return apiFetch<AnamnesisSubmission>(`${submissionPath(id)}/reject`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

export function revokeAnamnesisRequest(token: string, id: string): Promise<AnamnesisSubmission> {
  return apiFetch<AnamnesisSubmission>(`${submissionPath(id)}/revoke`, { method: 'POST', token });
}

const publicPath = (linkToken: string) => `/public/medical-history/${encodeURIComponent(linkToken)}`;

/** Página pública (sin sesión): la clínica sale del host. */
export function getPublicAnamnesis(linkToken: string): Promise<PublicAnamnesis> {
  return apiFetch<PublicAnamnesis>(publicPath(linkToken));
}

export function submitPublicAnamnesis(
  linkToken: string,
  body: SubmitBody,
): Promise<{ submittedAt: string }> {
  return apiFetch<{ submittedAt: string }>(publicPath(linkToken), { method: 'POST', body });
}

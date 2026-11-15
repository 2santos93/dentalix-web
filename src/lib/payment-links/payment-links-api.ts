import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';

type Schemas = components['schemas'];

// DX-569: el paciente reporta su pago desde un enlace; la caja lo confirma o lo rechaza.
export type PaymentLinkTarget = Schemas['PaymentLinkTargetDto'];
export type CreatePaymentLinkInput = Schemas['CreatePaymentLinkDto'];
export type CreatedPaymentLink = Schemas['CreatedPaymentLinkDto'];
export type PaymentLinkChannel = NonNullable<CreatePaymentLinkInput['channel']>;
export type PatientPaymentLink = Schemas['PatientPaymentLinkDto'];
export type PaymentLinkStatus = PatientPaymentLink['status'];
export type PaymentLinkConcept = PatientPaymentLink['concept'];

/**
 * La página pública. `regional` (la sede del enlace) se lee como opcional: sin
 * él, los importes y las fechas salen «—» (DX-354), nunca otro formato.
 */
export type PublicPaymentLink = Schemas['PublicPaymentLinkDto'] & {
  regional?: Schemas['DocumentRegionalDto'] | null;
};
export type PublicPaymentMethod = Schemas['PublicPaymentMethodDto'];
export type SubmitPaymentReportInput = Schemas['SubmitPaymentReportDto'];
export type PublicStagedProof = Schemas['PublicStagedProofDto'];

export type PaymentReport = Schemas['PaymentReportDto'];
export type PaymentReportStatus = Schemas['PaymentReportStatus'];
export type PaymentReportsPage = Schemas['PaymentReportsPageDto'];
export type ConfirmPaymentReportInput = Schemas['ConfirmPaymentReportDto'];
export type ConfirmedPaymentReport = Schemas['ConfirmedPaymentReportDto'];
export type RejectedPaymentReport = Schemas['RejectedPaymentReportDto'];
export type PaymentReportProofUrl = Schemas['PaymentReportProofUrlDto'];

/** Códigos estables de la API. */
export const PAYMENT_LINK_USED = 'PAYMENT_LINK_USED';
export const PAYMENT_REPORT_NOT_PENDING = 'PAYMENT_REPORT_NOT_PENDING';
export const PAYMENT_LINK_PROOF_UPLOADS_EXHAUSTED = 'PAYMENT_LINK_PROOF_UPLOADS_EXHAUSTED';

/** Concepto genérico (sin tratamientos), como lo nombra la API. */
export const PAYMENT_LINK_CONCEPT_LABELS: Record<PaymentLinkConcept, string> = {
  INSTALLMENT: 'Cuota del plan de pagos',
  BALANCE: 'Saldo pendiente',
};

/** Enviar enlaces y llevar la bandeja: los roles que cobran (PAYMENT_ROLES). */
export function canHandlePaymentLinks(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

// ── Personal: enlaces del paciente ──────────────────────────────────────────

const patientPath = (patientId: string) => `/patients/${encodeURIComponent(patientId)}/payment-links`;

export function createPaymentLink(
  token: string,
  patientId: string,
  input: CreatePaymentLinkInput,
): Promise<CreatedPaymentLink> {
  return apiFetch<CreatedPaymentLink>(patientPath(patientId), { method: 'POST', body: input, token });
}

/** Los enlaces del paciente con su estado; nunca traen la URL. */
export function listPatientPaymentLinks(token: string, patientId: string): Promise<PatientPaymentLink[]> {
  return apiFetch<PatientPaymentLink[]>(patientPath(patientId), { token });
}

// ── Página pública (sin sesión; la clínica sale del host) ───────────────────

const publicPath = (linkToken: string) => `/public/payment-links/${encodeURIComponent(linkToken)}`;

/** 404: no existe, caducó o se anuló. 410 `PAYMENT_LINK_USED`: ya se reportó. */
export function getPublicPaymentLink(linkToken: string): Promise<PublicPaymentLink> {
  return apiFetch<PublicPaymentLink>(publicPath(linkToken));
}

/** La página (no un previsualizador) avisa de que se abrió: 204, idempotente. */
export async function markPublicPaymentLinkOpened(linkToken: string): Promise<void> {
  await apiFetchOrNull<null>(`${publicPath(linkToken)}/opened`, { method: 'POST' });
}

/** El ticket prefirmado del comprobante (como `payments/proofs/upload-url`, 3 por enlace). */
export function requestPublicProofUpload(
  linkToken: string,
  file: SingleFileUploadRequest,
): Promise<Schemas['PaymentProofUploadDto']> {
  return apiFetch<Schemas['PaymentProofUploadDto']>(`${publicPath(linkToken)}/proof-upload`, { method: 'POST', body: file });
}

export function completePublicProofUpload(linkToken: string, uploadId: string): Promise<PublicStagedProof> {
  return apiFetch<PublicStagedProof>(`${publicPath(linkToken)}/proof-upload/complete`, {
    method: 'POST',
    body: { uploadId },
  });
}

export function submitPaymentReport(
  linkToken: string,
  input: SubmitPaymentReportInput,
): Promise<Schemas['PaymentReportedDto']> {
  return apiFetch<Schemas['PaymentReportedDto']>(`${publicPath(linkToken)}/report`, { method: 'POST', body: input });
}

// ── Bandeja «Pagos por confirmar» (Caja) ────────────────────────────────────

export interface PaymentReportsQuery {
  status?: PaymentReportStatus;
  page?: number;
  pageSize?: number;
}

/** La sede la pone la cabecera de la sede activa (como el resto de Caja). */
export function listPaymentReports(token: string, query: PaymentReportsQuery = {}): Promise<PaymentReportsPage> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiFetch<PaymentReportsPage>(`/payment-reports${qs ? `?${qs}` : ''}`, { token });
}

export function countPendingPaymentReports(token: string): Promise<Schemas['PaymentReportsCountDto']> {
  return apiFetch<Schemas['PaymentReportsCountDto']>('/payment-reports/count', { token });
}

/** URL firmada de 5 minutos; la consulta queda auditada. */
export function getPaymentReportProofUrl(token: string, reportId: string): Promise<PaymentReportProofUrl> {
  return apiFetch<PaymentReportProofUrl>(`/payment-reports/${encodeURIComponent(reportId)}/proof-url`, { token });
}

export function confirmPaymentReport(
  token: string,
  reportId: string,
  input: ConfirmPaymentReportInput,
): Promise<ConfirmedPaymentReport> {
  return apiFetch<ConfirmedPaymentReport>(`/payment-reports/${encodeURIComponent(reportId)}/confirm`, {
    method: 'POST',
    body: input,
    token,
  });
}

export function rejectPaymentReport(token: string, reportId: string, reason: string): Promise<RejectedPaymentReport> {
  return apiFetch<RejectedPaymentReport>(`/payment-reports/${encodeURIComponent(reportId)}/reject`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { statusLabels } from '@/lib/status/tones';

type Schemas = components['schemas'];

// Tipos del cliente generado (`npm run codegen`), DX-243.
export type SignatureRequest = Schemas['SignatureRequestDto'];
export type SignatureRequestCreated = Schemas['SignatureRequestCreatedDto'];
export type SignatureRequestOptions = Schemas['SignatureRequestOptionsDto'];
export type SignatureRequestStatus = SignatureRequest['status'];
export type CreateSignatureRequestInput = Schemas['CreateSignatureRequestDto'];
export type PublicSignature = Schemas['PublicSignatureDto'];
export type PublicSignatureDocument = Schemas['PublicSignatureDocumentDto'];
export type PublicSignedCopy = Schemas['PublicSignedCopyDto'];
export type SignatureSession = Schemas['SignatureSessionDto'];
export type PublicBudget = Schemas['PublicBudgetDto'];

/**
 * DX-415: la última solicitud de aceptación a distancia del presupuesto
 * `planId` (la lista viene de la más reciente a la más antigua), o null.
 */
export function latestBudgetRequest(requests: readonly SignatureRequest[], planId: string): SignatureRequest | null {
  return requests.find((r) => r.type === 'BUDGET' && r.treatmentPlanId === planId) ?? null;
}

/**
 * Estados de la ficha (DX-243): Enviado · Abierto · Bloqueado · Firmado por
 * paciente · Completo. Etiqueta y tono salen del mapa único (`tones.ts`).
 */
export const SIGNATURE_STATUS_LABELS: Record<SignatureRequestStatus, string> = statusLabels('signatureRequest');

/**
 * La etiqueta del estado con quien firmó: si fue el responsable de un menor,
 * «Firmado por responsable» en vez de «por paciente».
 */
export function signatureStatusLabel(
  status: SignatureRequestStatus,
  signerType: SignatureRequest['signerType'],
): string {
  return status === 'SIGNED_BY_PATIENT' && signerType === 'GUARDIAN'
    ? 'Firmado por responsable'
    : SIGNATURE_STATUS_LABELS[status];
}

/** Se puede anular mientras no esté firmado ni anulado. */
export function canRevokeSignatureRequest(status: SignatureRequestStatus): boolean {
  return status === 'SENT' || status === 'OPENED' || status === 'LOCKED' || status === 'EXPIRED';
}

/**
 * Enviar a firmar, ver el estado y anular: los cuatro roles (como la API,
 * SIGNATURE_REQUEST_ROLES). Solo decide qué se PINTA.
 */
export function canSendToSign(role: ClinicRole | null): boolean {
  return role !== null;
}

/** Código de la API cuando falta (o caducó) la sesión del código verificado. */
export const SIGNATURE_SESSION_REQUIRED = 'SIGNATURE_SESSION_REQUIRED';
/** Código de la API en el quinto código incorrecto (el enlace se bloquea). */
export const SIGNATURE_LINK_LOCKED = 'SIGNATURE_LINK_LOCKED';

const patientPath = (patientId: string) =>
  `/patients/${encodeURIComponent(patientId)}/signature-requests`;

/** `GET /patients/:id/signature-requests/options` — lo que necesita el modal. */
export function getSignatureRequestOptions(
  token: string,
  patientId: string,
): Promise<SignatureRequestOptions> {
  return apiFetch<SignatureRequestOptions>(`${patientPath(patientId)}/options`, { token });
}

/** `GET /patients/:id/signature-requests` — estado y evidencias, más recientes primero. */
export function listSignatureRequests(token: string, patientId: string): Promise<SignatureRequest[]> {
  return apiFetch<SignatureRequest[]>(patientPath(patientId), { token });
}

/** `POST /patients/:id/signature-requests` — envía el enlace por email. */
export function createSignatureRequest(
  token: string,
  patientId: string,
  input: CreateSignatureRequestInput,
): Promise<SignatureRequestCreated> {
  return apiFetch<SignatureRequestCreated>(patientPath(patientId), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /patients/:id/signature-requests/:rid/revoke` — el enlace deja de servir. */
export function revokeSignatureRequest(
  token: string,
  patientId: string,
  id: string,
): Promise<SignatureRequest> {
  return apiFetch<SignatureRequest>(`${patientPath(patientId)}/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    token,
  });
}

export type SignedConsentPdfStatus = Schemas['SignedConsentPdfStatus'];
export type SignedConsentPdfRetry = Schemas['SignedConsentPdfRetryDto'];

/**
 * DX-422: `POST /patients/:id/consents/:consentId/signed-pdf/retry` — vuelve a
 * encolar el PDF firmado que la API no pudo generar (FAILED). Los cuatro roles.
 */
export function retrySignedConsentPdf(
  token: string,
  patientId: string,
  consentId: string,
): Promise<SignedConsentPdfRetry> {
  return apiFetch<SignedConsentPdfRetry>(
    `/patients/${encodeURIComponent(patientId)}/consents/${encodeURIComponent(consentId)}/signed-pdf/retry`,
    { method: 'POST', token },
  );
}

export type SignedPdfCopyResent = Schemas['SignedPdfCopyResentDto'];

/**
 * DX-443: `POST /patients/:id/consents/:consentId/signed-pdf/copy` — reenvía al
 * paciente (o a su responsable) la copia del PDF firmado con un enlace nuevo
 * de un solo uso; el anterior deja de servir. Los cuatro roles.
 */
export function resendSignedConsentPdfCopy(
  token: string,
  patientId: string,
  consentId: string,
): Promise<SignedPdfCopyResent> {
  return apiFetch<SignedPdfCopyResent>(
    `/patients/${encodeURIComponent(patientId)}/consents/${encodeURIComponent(consentId)}/signed-pdf/copy`,
    { method: 'POST', token },
  );
}

// --- Página pública /copia/[token] (DX-443; sin sesión, la clínica sale del host) ---

export type PublicSignedPdfCopy = Schemas['PublicSignedPdfCopyDto'];
export type SignedPdfCopyDownload = Schemas['SignedPdfCopyDownloadDto'];
/** Código del 410 cuando el enlace de la copia ya se usó. */
export const SIGNED_PDF_COPY_LINK_USED = 'SIGNED_PDF_COPY_LINK_USED';

const copyPath = (linkToken: string) => `/public/signed-consent-copies/${encodeURIComponent(linkToken)}`;

/** `GET …/:token`: solo lee (los previsualizadores del correo lo abren solos). */
export function getPublicSignedPdfCopy(linkToken: string): Promise<PublicSignedPdfCopy> {
  return apiFetch<PublicSignedPdfCopy>(copyPath(linkToken));
}

/** `POST …/:token/download`: gasta el enlace y da una URL firmada de 60 s del PDF. */
export function downloadPublicSignedPdfCopy(linkToken: string): Promise<SignedPdfCopyDownload> {
  return apiFetch<SignedPdfCopyDownload>(`${copyPath(linkToken)}/download`, { method: 'POST' });
}

// --- Página pública /firmar/[token] (sin sesión; la clínica sale del host) ---

const publicPath = (linkToken: string) => `/public/sign/${encodeURIComponent(linkToken)}`;
const sessionHeader = (session: string) => ({ 'X-Signature-Session': session });

export function getPublicSignature(linkToken: string): Promise<PublicSignature> {
  return apiFetch<PublicSignature>(publicPath(linkToken));
}

/** Pide (o reenvía) el código de 6 dígitos; la primera vez cuenta como apertura. */
export function requestSignatureCode(linkToken: string): Promise<PublicSignature> {
  return apiFetch<PublicSignature>(`${publicPath(linkToken)}/code`, { method: 'POST' });
}

export function verifySignatureCode(linkToken: string, code: string): Promise<SignatureSession> {
  return apiFetch<SignatureSession>(`${publicPath(linkToken)}/verify`, {
    method: 'POST',
    body: { code },
  });
}

export function getPublicSignatureDocument(
  linkToken: string,
  session: string,
): Promise<PublicSignatureDocument> {
  return apiFetch<PublicSignatureDocument>(`${publicPath(linkToken)}/document`, {
    headers: sessionHeader(session),
  });
}

export function signPublicSignature(
  linkToken: string,
  session: string,
  body: { signature: string; accepted: boolean; signerDocument?: string },
): Promise<PublicSignedCopy> {
  return apiFetch<PublicSignedCopy>(`${publicPath(linkToken)}/sign`, {
    method: 'POST',
    body,
    headers: sessionHeader(session),
  });
}

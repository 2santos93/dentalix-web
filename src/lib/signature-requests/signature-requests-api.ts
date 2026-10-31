import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

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

/** Estados de la ficha (DX-243): Enviado · Abierto · Bloqueado · Firmado por paciente · Completo. */
export const SIGNATURE_STATUS_LABELS: Record<SignatureRequestStatus, string> = {
  SENT: 'Enviado',
  OPENED: 'Abierto',
  LOCKED: 'Bloqueado',
  EXPIRED: 'Caducado',
  REVOKED: 'Anulado',
  SIGNED_BY_PATIENT: 'Firmado por paciente',
  COMPLETE: 'Completo',
};

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

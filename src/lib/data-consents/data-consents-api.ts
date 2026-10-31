import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-037 · Autorización de tratamiento de datos. Los tipos salen
// tal cual del contrato generado (los DTO del backend llevan @ApiProperty).
export type PrivacyPolicies = components['schemas']['PrivacyPoliciesDto'];
export type PrivacyPolicyVersion = components['schemas']['PrivacyPolicyVersionDto'];
export type PublishPrivacyPolicyInput = components['schemas']['PublishPrivacyPolicyDto'];
export type PatientDataConsents = components['schemas']['PatientDataConsentsDto'];
export type DataConsentRecord = components['schemas']['DataConsentRecordDto'];
export type ScopeConsentStatus = components['schemas']['ScopeConsentStatusDto'];
export type DataConsentScope = components['schemas']['DataConsentScope'];
export type ConsentDecision = components['schemas']['ConsentDecisionDto'];
export type RecordDataConsentsInput = components['schemas']['RecordDataConsentsDto'];

/** Orden de presentación (el mismo que `current` en la respuesta). */
export const CONSENT_SCOPES: readonly DataConsentScope[] = [
  'GENERAL',
  'SENSITIVE_HEALTH',
  'MARKETING',
];

export const SCOPE_LABELS: Record<DataConsentScope, string> = {
  GENERAL: 'Datos personales',
  SENSITIVE_HEALTH: 'Datos sensibles de salud',
  MARKETING: 'Comunicaciones comerciales',
};

/** Texto de la casilla de cada scope dentro de una versión publicada. */
export function scopeText(policy: PrivacyPolicyVersion, scope: DataConsentScope): string {
  switch (scope) {
    case 'GENERAL':
      return policy.generalText;
    case 'SENSITIVE_HEALTH':
      return policy.sensitiveHealthText;
    case 'MARKETING':
      return policy.marketingText;
  }
}

/** Casillas del formulario: ninguna empieza marcada. */
export type ConsentSelection = Record<DataConsentScope, boolean>;

export const EMPTY_SELECTION: ConsentSelection = {
  GENERAL: false,
  SENSITIVE_HEALTH: false,
  MARKETING: false,
};

/**
 * Solo una casilla MARCADA es una decisión. Una sin marcar no genera fila: el
 * silencio no cuenta como autorización ni como negativa.
 */
export function decisionsFromSelection(selection: ConsentSelection): ConsentDecision[] {
  return CONSENT_SCOPES.filter((scope) => selection[scope]).map((scope) => ({
    scope,
    granted: true,
  }));
}

/** Publicar la política: solo ADMIN (PRIVACY_POLICY_WRITE_ROLES en la API). */
export function canPublishPrivacyPolicy(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /privacy-policies` — vigente (o `null`) e historial. Todos los roles. */
export function getPrivacyPolicies(token: string): Promise<PrivacyPolicies> {
  return apiFetch<PrivacyPolicies>('/privacy-policies', { token });
}

/** `POST /privacy-policies` — publica la versión siguiente (solo ADMIN). */
export function publishPrivacyPolicy(
  token: string,
  input: PublishPrivacyPolicyInput,
): Promise<PrivacyPolicyVersion> {
  return apiFetch<PrivacyPolicyVersion>('/privacy-policies', {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /patients/:id/data-consents` — estado vigente por scope e historial. */
export function getPatientDataConsents(
  token: string,
  patientId: string,
): Promise<PatientDataConsents> {
  return apiFetch<PatientDataConsents>(
    `/patients/${encodeURIComponent(patientId)}/data-consents`,
    { token },
  );
}

/**
 * `POST /patients/:id/data-consents` — registra aceptaciones o revocaciones
 * (append-only) contra la política vigente y devuelve el estado resultante.
 */
export function recordDataConsents(
  token: string,
  patientId: string,
  input: RecordDataConsentsInput,
): Promise<PatientDataConsents> {
  return apiFetch<PatientDataConsents>(
    `/patients/${encodeURIComponent(patientId)}/data-consents`,
    { method: 'POST', body: input, token },
  );
}

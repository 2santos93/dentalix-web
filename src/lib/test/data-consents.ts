import type {
  DataConsentRecord,
  PatientDataConsents,
  PrivacyPolicies,
  PrivacyPolicyVersion,
} from '@/lib/data-consents/data-consents-api';

export function policyFixture(overrides: Partial<PrivacyPolicyVersion> = {}): PrivacyPolicyVersion {
  return {
    id: 'pol-1',
    version: 1,
    policyText: 'Política de tratamiento de datos de la Clínica Demo.',
    generalText: 'Autorizo el tratamiento de mis datos personales.',
    sensitiveHealthText:
      'Autorizo mis datos sensibles de salud. No estoy obligado. Finalidad: atención.',
    marketingText: 'Autorizo recibir comunicaciones comerciales.',
    contentHash: 'a'.repeat(64),
    publishedAt: '2026-10-01T15:00:00.000Z',
    publishedBy: { id: 'u-admin', fullName: 'Dra. Admin' },
    ...overrides,
  };
}

export function policiesFixture(current: PrivacyPolicyVersion | null = policyFixture()): PrivacyPolicies {
  return { current, history: current ? [current] : [] };
}

export function consentRow(overrides: Partial<DataConsentRecord> = {}): DataConsentRecord {
  return {
    id: 'row-1',
    patientId: 'pat-1',
    scope: 'GENERAL',
    granted: true,
    channel: 'IN_PERSON',
    policyVersion: { id: 'pol-1', version: 1 },
    legacyPolicyVersion: null,
    recordedAt: '2026-10-02T14:30:00.000Z',
    recordedBy: { id: 'u-rec', fullName: 'Rosa Recepción' },
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

/** Estado vigente a partir del historial (última fila por scope), como la API. */
export function consentsFixture(history: DataConsentRecord[] = []): PatientDataConsents {
  const sorted = [...history].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return {
    history: sorted,
    current: (['GENERAL', 'SENSITIVE_HEALTH', 'MARKETING'] as const).map((scope) => {
      const latest = sorted.find((r) => r.scope === scope) ?? null;
      return { scope, granted: latest ? latest.granted : null, latest };
    }),
  };
}

/** JWT de clínica sin firma válida, solo para que `getTokenRole` lea el rol. */
export function tokenForRole(role: string): string {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(
    JSON.stringify({ sub: 'u1', tenantId: 't1', role }),
  )}.firma`;
}

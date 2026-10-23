import type { Agreement } from '@/lib/agreements/agreements-api';
import type { PatientAgreement } from '@/lib/patients/patient-agreement-api';
import type { PatientCoverage } from '@/lib/patients/coverages-api';

// Datos de prueba compartidos por los tests del convenio del paciente (DX-105).
export function agreementDto(
  id: string,
  name: string,
  payer: { id: string; name: string },
  over: Partial<Agreement> = {},
): Agreement {
  return {
    id,
    name,
    payer,
    kind: 'PERCENT_DISCOUNT',
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  } as Agreement;
}

export function patientAgreement(over: Partial<PatientAgreement> = {}): PatientAgreement {
  return {
    id: 'pa1',
    patientId: 'p1',
    agreement: {
      id: 'ag1',
      name: 'Sanitas 2026',
      kind: 'PERCENT_DISCOUNT',
      active: true,
      validFrom: null,
      validTo: null,
      payer: { id: 'pay-1', name: 'Sanitas' },
    },
    coverageId: null,
    validFrom: null,
    validTo: '2027-01-31',
    notes: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    retiredAt: null,
    ...over,
  };
}

export function coverageFor(
  id: string,
  payer: { id: string; name: string },
  planName: string | null,
): PatientCoverage {
  return {
    id,
    patientId: 'p1',
    payer: { ...payer, type: 'OTRO', country: null, active: true },
    planName,
    memberNumber: '88123456',
    policyHolderName: null,
    validFrom: null,
    validTo: null,
    isPrimary: true,
    notes: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as PatientCoverage;
}

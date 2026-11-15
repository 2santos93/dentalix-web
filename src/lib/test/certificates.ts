import type { EligibleAppointment, PatientCertificate } from '@/lib/certificates/certificates-api';

/** Justificante vigente de la sede `loc1` (UTC en las pruebas), emitido por `u-dentist`. */
export function makeCertificate(overrides: Partial<PatientCertificate> = {}): PatientCertificate {
  return {
    id: 'cert1',
    patientId: 'p1',
    appointmentId: 'appt1',
    locationId: 'loc1',
    kind: 'ATTENDANCE',
    number: 123,
    numberLabel: '000123',
    issuedAt: '2026-11-16T15:00:00.000Z',
    issuedById: 'u-dentist',
    issuedByName: 'Dra. Andreina Salazar',
    attendedFrom: '2026-11-16T13:05:00.000Z',
    attendedUntil: '2026-11-16T13:50:00.000Z',
    timesSource: 'ACTUAL',
    restDays: null,
    restStartDate: null,
    restEndDate: null,
    diagnosis: null,
    hasDiagnosis: false,
    snapshot: {
      patient: { name: 'Yusmary Rondón', document: 'V-12345678' },
      professional: { name: 'Dra. Andreina Salazar', license: 'MPPS 45678', specialty: null },
      location: {
        name: 'Sede Chacao',
        address: null,
        healthRegistrationNumber: null,
        timeZone: 'America/Caracas',
        locale: 'es-VE',
        hourCycle: 'h12',
      },
      clinic: { name: 'Clínica Ávila', legalName: null, taxIdLabel: null, taxId: null },
    },
    documentId: 'doc1',
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
    voidedDocumentId: null,
    ...overrides,
  };
}

/** Cita atendida de la sede `loc1`, sin certificados vigentes. */
export function makeEligibleAppointment(overrides: Partial<EligibleAppointment> = {}): EligibleAppointment {
  return {
    id: 'appt1',
    locationId: 'loc1',
    locationName: 'Sede Chacao',
    start: '2026-11-16T13:00:00.000Z',
    end: '2026-11-16T13:30:00.000Z',
    providerName: 'Dra. Andreina Salazar',
    liveKinds: [],
    ...overrides,
  };
}

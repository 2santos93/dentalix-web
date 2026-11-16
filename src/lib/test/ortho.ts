import type { OrthoCase, OrthoFollowUpRow, OrthoVisit } from '@/lib/ortho/ortho-api';

/** Caso de ortodoncia de prueba: 24 meses y 24 controles, sede Caracas. */
export function makeOrthoCase(overrides: Partial<OrthoCase> = {}): OrthoCase {
  return {
    id: 'case-1',
    patientId: 'p1',
    locationId: 'loc-1',
    locationName: 'Sede principal',
    providerId: 'u-dentist',
    providerName: 'Dra. Rivas',
    treatmentPlanId: null,
    technique: 'METAL_BRACKETS',
    startDate: '2026-08-10',
    estimatedMonths: 24,
    plannedVisits: 24,
    visitIntervalDays: 30,
    status: 'ACTIVE',
    statusReason: null,
    statusChangedAt: null,
    statusChangedById: null,
    statusChangedByName: null,
    bondedOn: null,
    debondedOn: null,
    createdById: 'u-dentist',
    createdAt: '2026-08-10T14:00:00.000Z',
    updatedAt: '2026-08-10T14:00:00.000Z',
    progress: { visitsDone: 3, plannedVisits: 24, monthsElapsed: 3, estimatedMonths: 24, percent: 12 },
    currentUpperWire: { material: 'STEEL', gauge: '0.016x0.022' },
    currentLowerWire: { material: 'NITI', gauge: '0.018' },
    lastVisitDate: '2026-11-10',
    nextVisitProposedOn: '2026-12-10',
    overdue: false,
    ...overrides,
  };
}

export function makeOrthoVisit(overrides: Partial<OrthoVisit> = {}): OrthoVisit {
  return {
    id: 'visit-3',
    caseId: 'case-1',
    clinicalEntryId: 'entry-3',
    visitNumber: 3,
    visitDate: '2026-11-10',
    appointmentId: null,
    upperWire: { material: 'STEEL', gauge: '0.016x0.022' },
    lowerWire: { material: 'NITI', gauge: '0.018' },
    elasticsType: 'CLASS_II',
    elasticsWear: 'FULL_TIME',
    applianceChanges: null,
    incidents: ['BRACKET_DEBONDED'],
    hygieneIndex: 2,
    nextVisitProposedOn: '2026-12-10',
    notes: 'Control de ortodoncia.\nArco superior: Acero 0.016x0.022.\n\nSe recementa bracket del 22',
    authorId: 'u-dentist',
    authorName: 'Dra. Rivas',
    createdAt: '2026-11-10T14:30:00.000Z',
    addenda: [],
    ...overrides,
  };
}

export function makeFollowUpRow(overrides: Partial<OrthoFollowUpRow> = {}): OrthoFollowUpRow {
  return {
    caseId: 'case-1',
    patientId: 'p1',
    patientFirstName: 'Valentina',
    patientLastName: 'Pérez',
    patientPhone: '0412-1234567',
    patientPhoneE164: '+584121234567',
    locationId: 'loc-1',
    locationName: 'Sede principal',
    providerId: 'u-dentist',
    providerName: 'Dra. Rivas',
    technique: 'METAL_BRACKETS',
    startDate: '2026-06-01',
    visitIntervalDays: 30,
    visitsDone: 3,
    plannedVisits: 24,
    lastVisitDate: '2026-09-27',
    daysSinceLastVisit: 50,
    overdue: true,
    nextAppointmentAt: null,
    noNextAppointment: true,
    noShowCount: 1,
    ...overrides,
  };
}

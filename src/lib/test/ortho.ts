import type { OrthoCase, OrthoFollowUpRow, OrthoVisit } from '@/lib/ortho/ortho-api';
import type { OrthoAligners, OrthoAlignerSeries, OrthoCaseAccount, OrthoFee } from '@/lib/ortho/ortho-billing';

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
    fee: null,
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

/** DX-285: honorario de prueba: 3.000.000 VES (600.000 + 24 × 90.000 + 240.000). */
export function makeOrthoFee(overrides: Partial<OrthoFee> = {}): OrthoFee {
  return {
    currency: 'VES',
    total: 3_000_000,
    initial: 600_000,
    perVisit: 90_000,
    visitCount: 24,
    retention: 240_000,
    updatedAt: '2026-08-10T14:00:00.000Z',
    updatedById: 'u-dentist',
    acceptedAt: '2026-08-10T15:00:00.000Z',
    acceptedById: 'u-dentist',
    paymentPlanId: null,
    ...overrides,
  };
}

/** DX-285: cuenta del caso con 3 de 24 controles realizados. */
export function makeOrthoAccount(overrides: Partial<OrthoCaseAccount> = {}): OrthoCaseAccount {
  return {
    caseId: 'case-1',
    patientId: 'p1',
    locationId: 'loc-1',
    status: 'ACTIVE',
    startDate: '2026-08-10',
    plannedVisits: 24,
    visitsDone: 3,
    billing: 'PLAN_ITEMS',
    currency: 'VES',
    treatmentPlanId: 'plan-1',
    fee: makeOrthoFee(),
    billed: 870_000,
    paid: 600_000,
    balance: 270_000,
    remaining: 2_130_000,
    overdue: 0,
    overdueSince: null,
    overdueAgeDays: 0,
    hasOverdue: false,
    overdueDays: 30,
    visitsCharged: 3,
    removedCharges: 0,
    paymentPlan: null,
    ...overrides,
  };
}

export function makeAlignerSeries(overrides: Partial<OrthoAlignerSeries> = {}): OrthoAlignerSeries {
  return {
    id: 'series-1',
    caseId: 'case-1',
    arch: 'BOTH',
    brand: 'Marca X',
    totalTrays: 20,
    daysPerTray: 14,
    refinementOfId: null,
    sequence: 1,
    createdById: 'u-dentist',
    createdByName: 'Dra. Rivas',
    createdAt: '2026-09-01T14:00:00.000Z',
    deliveries: [
      {
        id: 'd-1',
        fromTray: 1,
        toTray: 4,
        deliveredOn: '2026-09-01',
        visitId: null,
        createdById: 'u-dentist',
        createdByName: 'Dra. Rivas',
        createdAt: '2026-09-01T14:00:00.000Z',
      },
    ],
    state: 'IN_PROGRESS',
    currentTray: 3,
    currentTrayStartedOn: '2026-09-29',
    nextChangeOn: '2026-10-13',
    lastDeliveredTray: 4,
    estimatedEndOn: '2027-06-08',
    ...overrides,
  };
}

export function makeAligners(overrides: Partial<OrthoAligners> = {}): OrthoAligners {
  return {
    today: '2026-10-05',
    series: [makeAlignerSeries()],
    upperSeriesId: 'series-1',
    lowerSeriesId: 'series-1',
    ...overrides,
  };
}

import type {
  ExternalOrder,
  ExternalOrderTemplate,
  PendingExternalOrder,
} from '@/lib/external-orders/external-orders-api';

/** Orden emitida de prueba (datos inventados). */
export function makeExternalOrder(overrides: Partial<ExternalOrder> = {}): ExternalOrder {
  return {
    id: 'eo1',
    patientId: 'p1',
    locationId: 'loc1',
    appointmentId: null,
    kind: 'IMAGING',
    status: 'ISSUED',
    number: 7,
    numberLabel: '000007',
    issuedAt: '2026-11-10T14:00:00.000Z',
    issuedById: 'u-dentist',
    issuedByName: 'Dra. Laura Ruiz',
    recipient: 'Centro de Imagen Norte',
    items: ['Radiografía panorámica'],
    toothNumbers: [],
    clinicalNote: null,
    hasClinicalNote: false,
    templateId: null,
    snapshot: {
      patient: { name: 'Ana Pérez', document: 'DOC-1020', ageYears: 34 },
      professional: { name: 'Dra. Laura Ruiz', license: 'RM-12345', specialty: null },
      location: {
        name: 'Sede Centro',
        address: null,
        healthRegistrationNumber: null,
        timeZone: 'UTC',
        locale: 'es',
        hourCycle: 'h23',
      },
      clinic: { name: 'Clínica Demo', legalName: null, taxIdLabel: null, taxId: null },
    },
    documentId: 'doc-pdf',
    resultDocumentId: null,
    resultLinkedAt: null,
    resultLinkedById: null,
    resultLinkedByName: null,
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
    voidedDocumentId: null,
    ...overrides,
  };
}

export function makeExternalOrderTemplate(overrides: Partial<ExternalOrderTemplate> = {}): ExternalOrderTemplate {
  return {
    id: 'tpl1',
    name: 'Radiografía panorámica',
    kind: 'IMAGING',
    recipient: 'Centro de Imagen Norte',
    items: ['Radiografía panorámica'],
    active: true,
    version: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makePendingExternalOrder(overrides: Partial<PendingExternalOrder> = {}): PendingExternalOrder {
  return {
    order: makeExternalOrder(),
    patient: { id: 'p1', firstName: 'Ana', lastName: 'Pérez' },
    ageDays: 3,
    overdue: false,
    ...overrides,
  };
}

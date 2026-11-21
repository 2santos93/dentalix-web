import type { DentalLab, DentalLabService, LabOrder } from '@/lib/lab-orders/lab-orders-api';

// DX-017: datos inventados de laboratorio dental para las pruebas (Venezuela/USD).

export function makeLabService(overrides: Partial<DentalLabService> = {}): DentalLabService {
  return {
    id: 'svc1',
    labId: 'lab1',
    name: 'Corona zirconio',
    leadTimeBusinessDays: 5,
    referencePrice: '120.00',
    referenceCurrency: 'USD',
    active: true,
    ...overrides,
  };
}

export function makeDentalLab(overrides: Partial<DentalLab> = {}): DentalLab {
  return {
    id: 'lab1',
    name: 'Laboratorio Dental Caracas',
    contactName: 'Carmen Rojas',
    phone: null,
    email: 'pedidos@lab.example',
    notes: null,
    active: true,
    services: [makeLabService()],
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

/** Orden en borrador del paciente p1 en la sede loc1. */
export function makeLabOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return {
    id: 'lo1',
    number: 12,
    status: 'DRAFT',
    overdue: false,
    daysOverdue: null,
    patientId: 'p1',
    patient: { id: 'p1', fullName: 'Ana Pérez' },
    locationId: 'loc1',
    location: { id: 'loc1', name: 'Sede Centro' },
    lab: { id: 'lab1', name: 'Laboratorio Dental Caracas' },
    service: { id: 'svc1', name: 'Corona zirconio', leadTimeBusinessDays: 5 },
    professional: { membershipId: 'm1', userId: 'u-dentist', fullName: 'Dra. Laura Ruiz' },
    description: 'Corona de zirconio',
    toothNumbers: ['16'],
    shade: 'A2',
    material: 'Zirconio monolítico',
    instructions: null,
    clinicalRedacted: false,
    cost: null,
    dueOn: '2026-11-20',
    sentAt: null,
    sentBy: null,
    receivedAt: null,
    receivedBy: null,
    checkedAt: null,
    checkedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    treatmentPlanItem: null,
    appointment: null,
    replacesOrder: null,
    replacedBy: [],
    createdAt: '2026-11-13T14:00:00.000Z',
    createdBy: { id: 'u-dentist', fullName: 'Dra. Laura Ruiz' },
    updatedAt: '2026-11-13T14:00:00.000Z',
    ...overrides,
  };
}

/** Enviada, con la fecha prometida vencida y sin recibir. */
export function makeOverdueLabOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return makeLabOrder({
    id: 'lo2',
    number: 9,
    status: 'SENT',
    overdue: true,
    daysOverdue: 3,
    dueOn: '2026-11-10',
    sentAt: '2026-11-03T13:00:00.000Z',
    sentBy: { id: 'u-rec', fullName: 'Rita Recepción' },
    ...overrides,
  });
}

export function labOrderPage(items: LabOrder[]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

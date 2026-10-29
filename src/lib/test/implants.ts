import type { ImplantCard, ImplantLotMatch, PatientImplant } from '@/lib/implants/implants-api';

export { tokenFor } from './prescriptions';

/** Implante de ejemplo (DX-191) para los tests de componentes. */
export function makeImplant(overrides: Partial<PatientImplant> = {}): PatientImplant {
  return {
    id: 'impl-1',
    patientId: 'p1',
    locationId: 'loc-1',
    locationName: 'Sede principal',
    professionalId: 'u-dentist',
    professionalName: 'Dra. Laura Ruiz',
    placedOn: '2026-10-10',
    toothNumber: '36',
    treatmentPlanItemId: null,
    kind: 'IMPLANT',
    manufacturer: 'Straumann',
    system: 'BLT',
    reference: '021.5310',
    lot: 'LOT-AB12',
    udi: null,
    diameterMm: 4.1,
    lengthMm: 10,
    sanitaryRegistration: 'REG-2019-0019876',
    notes: null,
    createdAt: '2026-10-10T15:00:00.000Z',
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    cardDeliveredAt: null,
    ...overrides,
  };
}

export function makeImplantCard(overrides: Partial<ImplantCard> = {}): ImplantCard {
  return {
    patientId: 'p1',
    patientName: 'Lucía Gómez',
    patientDocument: 'Documento nacional DOC-0002',
    patientBirthDate: '1980-05-02',
    clinicName: 'Clínica Demo',
    locations: [{ id: 'loc-1', name: 'Sede principal', address: 'Cra 7 # 72-10' }],
    placedOn: '2026-10-10',
    professionals: ['Dra. Laura Ruiz'],
    items: [
      {
        id: 'impl-1',
        toothNumber: '36',
        kind: 'IMPLANT',
        kindLabel: 'Implante',
        manufacturer: 'Straumann',
        system: 'BLT',
        reference: '021.5310',
        lot: 'LOT-AB12',
        udi: null,
        diameterMm: 4.1,
        lengthMm: 10,
        sanitaryRegistration: 'REG-2019-0019876',
        voided: false,
        voidedAt: null,
        cardDeliveredAt: null,
      },
      {
        id: 'impl-2',
        toothNumber: '36',
        kind: 'ABUTMENT',
        kindLabel: 'Pilar',
        manufacturer: 'Straumann',
        system: 'BLT',
        reference: 'RC-ABUT-4',
        lot: 'LOT-PILAR-7',
        udi: null,
        diameterMm: null,
        lengthMm: null,
        sanitaryRegistration: null,
        voided: true,
        voidedAt: '2026-10-11T10:00:00.000Z',
        cardDeliveredAt: null,
      },
    ],
    deliveredAt: null,
    ...overrides,
  };
}

export function makeLotMatch(overrides: Partial<ImplantLotMatch> = {}): ImplantLotMatch {
  return {
    implantId: 'impl-1',
    patientId: 'p1',
    patientName: 'Lucía Gómez',
    patientDocument: 'Documento nacional DOC-0002',
    phone: '+57 300 000 0001',
    placedOn: '2026-10-10',
    toothNumber: '36',
    kind: 'IMPLANT',
    manufacturer: 'Straumann',
    system: 'BLT',
    reference: '021.5310',
    lot: 'LOT-AB12',
    professionalName: 'Dra. Laura Ruiz',
    locationName: 'Sede principal',
    voided: false,
    ...overrides,
  };
}

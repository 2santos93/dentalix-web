import type {
  Prescription,
  PrescriptionDocument,
  PrescriptionIssuer,
  PrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';

/** JWT de prueba (sin firma válida: la web solo lee los claims). */
export function tokenFor(role: string, sub = 'u-dentist'): string {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub, tenantId: 't1', role }))}.firma`;
}

export function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: 'rx1',
    tenantId: 't1',
    locationId: 'loc1',
    patientId: 'p1',
    professionalId: 'u-dentist',
    country: 'CO',
    status: 'ISSUED',
    issuedAt: '2026-10-16T15:00:00.000Z',
    dispensationDate: '2026-10-16',
    validUntil: '2026-11-14',
    patientName: 'Ana Pérez',
    patientDocument: 'CC 1020',
    patientBirthYear: null,
    clinicalRecordNumber: '1020',
    professionalName: 'Dra. Laura Ruiz',
    professionalLicense: 'RM-12345',
    professionalEmail: 'laura@example.com',
    clinicName: 'Clínica Demo',
    locationName: 'Sede Principal',
    locationAddress: 'Cra 15 #90-20',
    notes: null,
    allergyOverride: false,
    allergyMatches: [],
    safetyRulesVersion: 'RX_SAFETY_V1',
    safetyAlerts: [],
    safetyOverrideReason: null,
    contentHash: 'a'.repeat(64),
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    items: [
      {
        id: 'i1',
        position: 1,
        activeIngredient: 'Amoxicilina',
        brandName: null,
        concentration: '500 mg',
        pharmaceuticalForm: 'Cápsula',
        route: 'Oral',
        dose: '1 cápsula',
        frequency: 'Cada 8 horas',
        durationDays: 7,
        totalQuantity: 21,
        quantityUnit: 'cápsulas',
        quantityInWords: 'veintiuno',
        packages: null,
        instructions: null,
      },
    ],
    ...overrides,
  };
}

export function makePrescriptionDocument(
  overrides: Partial<PrescriptionDocument> = {},
): PrescriptionDocument {
  return { ...makePrescription(), clinicLogoUrl: null, integrityOk: true, ...overrides };
}

export function makeIssuer(overrides: Partial<PrescriptionIssuer> = {}): PrescriptionIssuer {
  return {
    country: 'CO',
    locationId: 'loc1',
    locationName: 'Sede Principal',
    locationAddress: 'Cra 15 #90-20',
    clinicName: 'Clínica Demo',
    professionalName: 'Dra. Laura Ruiz',
    professionalLicense: 'RM-12345',
    validityDays: 30,
    maxItems: 10,
    ...overrides,
  };
}

export const postExodoncia: PrescriptionTemplate = {
  id: 'tpl1',
  tenantId: 't1',
  name: 'Post-exodoncia',
  notes: 'Dieta blanda',
  items: [
    {
      activeIngredient: 'Ibuprofeno',
      brandName: null,
      concentration: '600 mg',
      pharmaceuticalForm: 'Tableta',
      route: 'Oral',
      dose: '1 tableta',
      frequency: 'Cada 8 horas',
      durationDays: 3,
      totalQuantity: 9,
      quantityUnit: 'tabletas',
      packages: null,
      instructions: null,
    },
  ],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

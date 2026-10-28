import type {
  Prescription,
  PrescriptionDocument,
  PrescriptionIssuer,
  PrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';
import type { components } from '@/lib/api/schema';

/** JWT de prueba (sin firma válida: la web solo lee los claims). */
export function tokenFor(role: string, sub = 'u-dentist'): string {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub, tenantId: 't1', role }))}.firma`;
}

/**
 * Receta única (DX-324): `country: null`, la API la emite con `singleFormat`
 * (no viaja en el contrato). Su documento lleva el formato de una sede en
 * `en-US`/`h12`/`America/New_York`.
 */
export function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: 'rx1',
    tenantId: 't1',
    locationId: 'loc1',
    patientId: 'p1',
    professionalId: 'u-dentist',
    country: null,
    status: 'ISSUED',
    issuedAt: '2026-10-16T15:00:00.000Z',
    dispensationDate: '2026-10-16',
    validUntil: '2026-11-14',
    patientName: 'Ana Pérez',
    patientDocument: 'CC 1020',
    patientBirthYear: null,
    patientAgeYears: null,
    patientWeightKg: null,
    clinicalRecordNumber: '1020',
    professionalName: 'Dra. Laura Ruiz',
    professionalLicense: 'RM-12345',
    professionalSpecialty: null,
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

/**
 * Receta anterior a DX-324, con la plantilla congelada de su país: los datos
 * que guardaba cada una (nº de HC en `CO`; documento, año de nacimiento,
 * envases y 10 días de validez en `ES`).
 */
export function makeLegacyPrescription(
  country: components['schemas']['LegacyPrescriptionCountry'],
  overrides: Partial<Prescription> = {},
): Prescription {
  const base = makePrescription({ country });
  if (country === 'CO') return { ...base, ...overrides };
  return {
    ...base,
    validUntil: '2026-10-25',
    patientDocument: '12345678Z',
    patientBirthYear: 1980,
    clinicalRecordNumber: null,
    professionalLicense: '28/012345',
    items: [{ ...base.items[0], packages: 2 }],
    ...overrides,
  };
}

export const PRESCRIPTION_NEW_YORK_FORMAT: PrescriptionDocument['locationFormat'] = {
  locale: 'en-US',
  hourCycle: 'h12',
  timeZone: 'America/New_York',
};

export function makePrescriptionDocument(
  overrides: Partial<PrescriptionDocument> = {},
): PrescriptionDocument {
  return {
    ...makePrescription(),
    clinicLogoUrl: null,
    locationFormat: PRESCRIPTION_NEW_YORK_FORMAT,
    integrityOk: true,
    ...overrides,
  };
}

export function makeIssuer(overrides: Partial<PrescriptionIssuer> = {}): PrescriptionIssuer {
  return {
    locationId: 'loc1',
    locationName: 'Sede Principal',
    locationAddress: 'Cra 15 #90-20',
    clinicName: 'Clínica Demo',
    professionalName: 'Dra. Laura Ruiz',
    professionalLicense: 'RM-12345',
    professionalSpecialty: null,
    validityDays: 30,
    maxItems: 10,
    printQuantityInWords: false,
    requireClinicalRecordNumber: false,
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

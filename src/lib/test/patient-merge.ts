import type {
  DuplicatePair,
  DuplicatePatient,
  MergeFieldValues,
  MergePreview,
  MergeSide,
} from '@/lib/patients/patient-merge-api';

/** DX-266: fichas de prueba (Venezuela). */
export function mergeFields(over: Partial<MergeFieldValues> = {}): MergeFieldValues {
  return {
    firstName: 'María',
    lastName: 'Rodríguez',
    documentType: 'NATIONAL_ID',
    docTypeLabel: null,
    docNumber: 'V-12.345.678',
    birthDate: '1990-04-12',
    sex: 'F',
    phone: '+584141234567',
    email: null,
    address: null,
    countryCode: 'VE',
    cityId: null,
    maritalStatus: null,
    occupation: null,
    physicianName: null,
    physicianPhone: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    notes: null,
    preferredLanguage: null,
    ...over,
  };
}

export function duplicatePatient(over: Partial<DuplicatePatient> = {}): DuplicatePatient {
  return {
    id: 'p-a',
    patientCode: '1001',
    firstName: 'María',
    lastName: 'Rodríguez',
    documentType: 'NATIONAL_ID',
    docTypeLabel: null,
    docNumber: 'V-12.345.678',
    birthDate: '1990-04-12',
    phone: '+584141234567',
    email: null,
    createdAt: '2025-03-10T14:00:00.000Z',
    lastAttentionAt: '2026-10-02T15:00:00.000Z',
    ...over,
  };
}

export function duplicatePair(over: Partial<DuplicatePair> = {}): DuplicatePair {
  return {
    patients: [
      duplicatePatient(),
      duplicatePatient({
        id: 'p-b',
        patientCode: '1042',
        docNumber: '12345678',
        createdAt: '2026-09-01T14:00:00.000Z',
        lastAttentionAt: null,
      }),
    ],
    reasons: ['DOCUMENT', 'NAME_BIRTHDATE'],
    ...over,
  };
}

export function mergeSide(over: Partial<MergeSide> = {}): MergeSide {
  return {
    id: 'p-a',
    patientCode: '1001',
    createdAt: '2025-03-10T14:00:00.000Z',
    lastAttentionAt: null,
    cityName: null,
    fields: mergeFields(),
    counts: [],
    ...over,
  };
}

export function mergePreview(over: Partial<MergePreview> = {}): MergePreview {
  return {
    kept: mergeSide(),
    absorbed: mergeSide({ id: 'p-b', patientCode: '1042', fields: mergeFields({ docNumber: '12345678' }) }),
    blockers: [],
    absorbedLiveLinks: {
      slotOffers: 0,
      consentSignatures: 0,
      budgetSignatures: 0,
      signedPdfCopies: 0,
      anamnesis: 0,
      prescriptionCopies: 0,
      certificateCopies: 0,
      externalOrderCopies: 0,
      paymentLinks: 0,
      total: 0,
    },
    ...over,
  };
}

import type {
  ClinicalRecordCopyDocument,
  ClinicalRecordCopySummary,
} from '@/lib/patients/clinical-record-copies-api';

export function makeCopySummary(over: Partial<ClinicalRecordCopySummary> = {}): ClinicalRecordCopySummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    from: '2026-03-01',
    to: '2026-03-31',
    sections: ['EVOLUTIONS', 'APPOINTMENTS'],
    deliveredTo: 'Carmen Rondón (madre)',
    generatedAt: '2026-11-15T14:30:00.000Z',
    generatedBy: { id: '22222222-2222-4222-8222-222222222222', name: 'Dra. Andreina Salazar' },
    location: { id: '33333333-3333-4333-8333-333333333333', name: 'Sede Chacao' },
    ...over,
  };
}

export function makeCopyDocument(over: Partial<ClinicalRecordCopyDocument> = {}): ClinicalRecordCopyDocument {
  return {
    copy: makeCopySummary(),
    clinic: { name: 'Clínica Dental Ávila', legalName: null, taxIdLabel: null, taxId: null },
    location: { name: 'Sede Chacao', address: 'Av. Francisco de Miranda', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' },
    patient: { name: 'Mariela Rondón', patientCode: 42, document: 'Cédula V-12345678', birthDate: '1985-06-20' },
    content: {
      evolutions: [
        {
          entryDate: '2026-03-10T14:00:00.000Z',
          authorName: 'Dra. Andreina Salazar',
          authorLicense: 'MPPS 45678',
          locationName: 'Sede Chacao',
          appointmentStart: null,
          reason: 'Dolor en el 38',
          notes: 'Exodoncia del 38 sin complicaciones.',
          diagnoses: [{ icd10Code: 'K01.1', label: 'Dientes impactados', kind: 'PRINCIPAL', toothFdi: '38' }],
          addenda: [
            { createdAt: '2026-03-10T16:00:00.000Z', authorName: 'Dra. Andreina Salazar', reason: 'Seguimiento', text: 'Control a los 7 días.' },
            { createdAt: '2026-03-17T15:00:00.000Z', authorName: 'Dra. Andreina Salazar', reason: 'Seguimiento', text: 'Evolución favorable.' },
          ],
        },
      ],
      appointments: [],
    },
    empty: false,
    ...over,
  };
}

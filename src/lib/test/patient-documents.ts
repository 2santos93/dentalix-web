import type { PatientDocument } from '@/lib/patient-documents/patient-documents-api';

export { tokenFor } from './prescriptions';

/** Documento de ejemplo (DX-151) para los tests. */
export function makeDocument(overrides: Partial<PatientDocument> = {}): PatientDocument {
  return {
    id: 'doc-1',
    patientId: 'p1',
    locationId: 'loc-1',
    category: 'XRAY',
    originalName: 'panoramica.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1_572_864,
    sha256: 'a'.repeat(64),
    clinicalDate: '2026-10-10',
    toothNumbers: ['11', '21'],
    notes: null,
    uploadedById: 'u-dentist',
    uploadedByName: 'Dra. Laura Ruiz',
    uploadedAt: '2026-10-10T15:00:00.000Z',
    inlineViewable: true,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    ...overrides,
  };
}

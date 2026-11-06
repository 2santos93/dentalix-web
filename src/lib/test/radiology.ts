import type { RadiologyDueItem, RadiologyRecord } from '@/lib/radiology/radiology-api';

/** Un documento de prueba (DX-544): licencia Cat. I viva y al día en la Sede Norte. */
export function radiologyRecordFixture(partial: Partial<RadiologyRecord> & { id: string }): RadiologyRecord {
  return {
    tenantId: 't1',
    locationId: 'norte',
    locationName: 'Sede Norte',
    equipmentId: null,
    equipmentName: null,
    kind: 'LICENSE',
    category: 'I',
    reference: 'LIC-0456',
    issuer: 'Autoridad sanitaria',
    issuedOn: '2022-03-10',
    expiresOn: '2027-03-10',
    officerUserId: null,
    officerMemberName: null,
    officerName: null,
    notes: null,
    status: 'UP_TO_DATE',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    voidedAt: null,
    voidReason: null,
    ...partial,
  };
}

/** Un aviso de «Mi día» (DX-544): control de calidad vencido hace 12 días en la Sede Norte. */
export function radiologyDueFixture(partial: Partial<RadiologyDueItem> & { id: string }): RadiologyDueItem {
  return {
    kind: 'QUALITY_CONTROL',
    category: null,
    reference: null,
    issuer: 'Física Médica',
    locationId: 'norte',
    locationName: 'Sede Norte',
    equipmentId: null,
    equipmentName: null,
    expiresOn: '2026-10-25',
    status: 'OVERDUE',
    daysUntilExpiry: -12,
    ...partial,
  };
}

import type { PlanQuote } from '@/lib/treatment-plans/plan-quote-api';

/** Presupuesto de ejemplo para los tests de los componentes (DX-012). */
export function planQuoteFixture(overrides: Partial<PlanQuote> = {}): PlanQuote {
  return {
    version: 1,
    agreement: null,
    planId: 'plan-1',
    patientId: 'p1',
    planStatus: 'DRAFT',
    currency: 'COP',
    clinicName: 'Clínica Sonrisas',
    clinicLogoUrl: 'https://cdn.example.com/logo.png',
    location: { id: 'loc-1', name: 'Sede principal', address: 'Calle 93 # 14-20' },
    patient: { name: 'Ana Pérez', document: 'Documento nacional DOC-1020' },
    professionalName: 'Dra. Laura Gómez',
    issuedOn: '2026-10-16',
    validUntil: '2026-11-15',
    validityDays: 30,
    items: [
      {
        id: 'i1',
        toothNumber: '36',
        surfaces: [],
        procedure: 'Implante',
        quantity: 1,
        unitPrice: 3500000,
        discount: 350000,
        subtotal: 3150000,
        listPrice: null,
        agreementName: null,
      },
      {
        id: 'i2',
        toothNumber: '16',
        surfaces: ['OCCLUSAL', 'MESIAL'],
        procedure: 'Resina',
        quantity: 1,
        unitPrice: 150000,
        discount: 0,
        subtotal: 150000,
        listPrice: null,
        agreementName: null,
      },
    ],
    totals: [{ currency: 'COP', gross: 3650000, discount: 350000, net: 3300000, agreementSaving: 0 }],
    contentHash: 'c'.repeat(64),
    acceptance: null,
    ...overrides,
  };
}

export const SIGNED_ACCEPTANCE: NonNullable<PlanQuote['acceptance']> = {
  signerName: 'Ana Pérez',
  signature: 'data:image/png;base64,AAA',
  acceptedAt: '2026-10-16T15:30:00.000Z',
  acceptedByName: 'Dra. Laura Gómez',
  acceptanceHash: 'd'.repeat(64),
  integrityOk: true,
  ipAddress: null,
  userAgent: null,
  remote: null,
};

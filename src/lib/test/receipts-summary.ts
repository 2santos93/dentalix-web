import type { ReceiptsSummary } from '@/lib/payments/receipts-summary-api';

/**
 * Resumen de recibos de prueba (DX-401): un abono en USD, un cobro dividido
 * (USD + VES, dos filas del mismo recibo) y uno anulado.
 */
export function receiptsSummaryFixture(overrides: Partial<ReceiptsSummary> = {}): ReceiptsSummary {
  return {
    patient: {
      id: 'pat-1',
      fullName: 'Carolina Pérez',
      documentTypeName: 'Cédula',
      documentMasked: '****5678',
      patientCode: 'P-000042',
    },
    clinic: {
      name: 'Clínica Demo',
      legalName: 'Clínica Demo C.A.',
      taxId: 'J-12345678-9',
      taxIdLabel: 'RIF',
      address: 'Av. Francisco de Miranda, Caracas',
    },
    from: '2026-11-01',
    to: '2026-11-11',
    generatedAt: '2026-11-11T14:30:00.000Z',
    restrictedToLocations: false,
    receipts: [
      {
        paymentId: 'pay-1',
        receiptNumber: 'PRI-000101',
        issuedOn: '2026-11-03',
        locationName: 'Sede principal',
        methodLabel: 'Efectivo',
        amount: 125,
        currency: 'USD',
        voided: false,
        voidReason: null,
      },
      {
        paymentId: 'pay-2',
        receiptNumber: 'PRI-000102',
        issuedOn: '2026-11-05',
        locationName: 'Sede principal',
        methodLabel: 'Transferencia',
        amount: 80,
        currency: 'USD',
        voided: false,
        voidReason: null,
      },
      {
        paymentId: 'pay-2',
        receiptNumber: 'PRI-000102',
        issuedOn: '2026-11-05',
        locationName: 'Sede principal',
        methodLabel: 'Pago móvil',
        amount: 1500,
        currency: 'VES',
        voided: false,
        voidReason: null,
      },
      {
        paymentId: 'pay-4',
        receiptNumber: 'PRI-000104',
        issuedOn: '2026-11-07',
        locationName: 'Sede principal',
        methodLabel: 'Efectivo',
        amount: 40,
        currency: 'USD',
        voided: true,
        voidReason: 'Cobro duplicado en caja',
      },
    ],
    totals: [
      { currency: 'USD', amount: 205, count: 2 },
      { currency: 'VES', amount: 1500, count: 1 },
    ],
    voidedCount: 1,
    notice: 'Este resumen no es factura ni documento fiscal.',
    ...overrides,
  };
}

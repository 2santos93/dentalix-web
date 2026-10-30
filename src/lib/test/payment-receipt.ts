import type { PaymentReceipt } from '@/lib/payments/payment-receipts-api';

/** Recibo de caja de prueba (DX-136): emitido, sin anular, con datos fiscales pendientes. */
export function paymentReceiptFixture(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    paymentId: 'pay-1',
    reference: 'NOR-000123',
    seriesPrefix: 'NOR',
    number: 123,
    legacy: false,
    issuedAt: '2026-10-17T15:00:00.000Z',
    voided: false,
    voidedAt: null,
    voidReason: null,
    exchangeRate: null,
    snapshot: {
      version: 1,
      clinic: { name: 'Clínica Sonrisas', legalName: null, taxId: null, address: null },
      location: { id: 'loc-1', name: 'Sede Norte', address: 'Calle 100 # 15-20' },
      fiscalDataPending: true,
      patient: {
        id: 'pat-1',
        fullName: 'Carolina Duque',
        docType: 'NATIONAL_ID',
        docTypeLabel: null,
        docTypeName: 'ID local',
        docNumberMasked: '******5678',
      },
      payment: {
        id: 'pay-1',
        amount: 150000,
        currency: 'COP',
        method: 'CASH',
        paidAt: '2026-10-17T15:00:00.000Z',
        paidOn: '2026-10-17',
      },
      plan: { id: 'plan-1', optionLabel: 'Opción A: implante', createdAt: '2026-09-01T15:00:00.000Z' },
      planBalance: { currency: 'COP', billable: 900000, paid: 450000, balance: 450000 },
      cashier: { id: 'u-1', fullName: 'Rita Recepción' },
      legalNotice: 'Este documento no es factura',
    },
    ...overrides,
  };
}

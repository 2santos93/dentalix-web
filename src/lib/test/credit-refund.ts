import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { REGIONAL_VE } from './document-regional';

/** Comprobante de devolución de prueba (DX-253): USD 40.000 en efectivo, en la sede de Caracas. */
export function refundFixture(overrides: Partial<CreditRefund> = {}): CreditRefund {
  return {
    id: 'r-1',
    number: 'DEV-NOR-000007',
    patientId: 'pat-1',
    locationId: 'loc-1',
    treatmentPlanId: 'plan-1',
    currency: 'USD',
    amount: 40000,
    method: 'CASH',
    reason: 'El paciente se muda de ciudad',
    cashSessionId: 'cs-1',
    paymentIds: ['pay-1'],
    createdById: 'u-1',
    createdAt: '2026-10-31T15:00:00.000Z',
    regional: REGIONAL_VE,
    snapshot: {
      number: 'DEV-NOR-000007',
      issuedAt: '2026-10-31T15:00:00.000Z',
      clinic: { name: 'Clínica Sonrisa' },
      location: { id: 'loc-1', name: 'Sede Norte', address: null, timeZone: 'America/Caracas' },
      patient: {
        id: 'pat-1',
        fullName: 'Ana Favor',
        documentType: 'NATIONAL_ID',
        docTypeLabel: null,
        docNumber: '1027',
      },
      plan: { id: 'plan-1', label: null, createdAt: '2026-09-01T15:00:00.000Z' },
      amount: 40000,
      currency: 'USD',
      method: 'CASH',
      reason: 'El paciente se muda de ciudad',
      payments: [
        { id: 'pay-1', paidAt: '2026-09-02T15:00:00.000Z', amount: 300000, currency: 'USD', receiptNumber: 'NOR-000012' },
      ],
      creditBefore: 100000,
      creditAfter: 60000,
      refundedBy: { id: 'u-1', fullName: 'Rita Recepción' },
      cashSessionId: 'cs-1',
    },
    ...overrides,
  };
}

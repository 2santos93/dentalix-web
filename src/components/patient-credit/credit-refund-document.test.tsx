import { render, screen } from '@testing-library/react';
import { CreditRefundDocument } from './credit-refund-document';
import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';

const refund: CreditRefund = {
  id: 'r-1',
  number: 'DEV-NOR-000007',
  patientId: 'pat-1',
  locationId: 'loc-1',
  treatmentPlanId: 'plan-1',
  currency: 'COP',
  amount: 40000,
  method: 'CASH',
  reason: 'El paciente se muda de ciudad',
  cashSessionId: 'cs-1',
  paymentIds: ['pay-1'],
  createdById: 'u-1',
  createdAt: '2026-10-31T15:00:00.000Z',
  snapshot: {
    number: 'DEV-NOR-000007',
    issuedAt: '2026-10-31T15:00:00.000Z',
    clinic: { name: 'Clínica Sonrisa' },
    location: { id: 'loc-1', name: 'Sede Norte', address: null, timeZone: 'America/Bogota' },
    patient: {
      id: 'pat-1',
      fullName: 'Ana Favor',
      documentType: 'NATIONAL_ID',
      docTypeLabel: null,
      docNumber: '1027',
    },
    plan: { id: 'plan-1', label: null, createdAt: '2026-09-01T15:00:00.000Z' },
    amount: 40000,
    currency: 'COP',
    method: 'CASH',
    reason: 'El paciente se muda de ciudad',
    payments: [
      { id: 'pay-1', paidAt: '2026-09-02T15:00:00.000Z', amount: 300000, currency: 'COP', receiptNumber: 'NOR-000012' },
    ],
    creditBefore: 100000,
    creditAfter: 60000,
    refundedBy: { id: 'u-1', fullName: 'Rita Recepción' },
    cashSessionId: 'cs-1',
  },
};

it.each(['a4', '80mm'] as const)(
  'el comprobante (%s) lleva número, paciente, importe, método, motivo, abonos y líneas de firma',
  (format) => {
    render(<CreditRefundDocument refund={refund} format={format} />);
    const doc = screen.getByTestId('refund-document');
    expect(doc).toHaveAttribute('data-format', format);
    expect(doc).toHaveTextContent('N.º DEV-NOR-000007');
    expect(doc).toHaveTextContent('Ana Favor');
    expect(doc).toHaveTextContent(/40\.000/);
    expect(doc).toHaveTextContent('Efectivo');
    expect(doc).toHaveTextContent('El paciente se muda de ciudad');
    expect(doc).toHaveTextContent('NOR-000012');
    expect(screen.getAllByTestId('signature-line')).toHaveLength(2);
    expect(doc).toHaveTextContent(/Firma del paciente/);
  },
);

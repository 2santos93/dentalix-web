import { render, screen } from '@testing-library/react';
import { CreditRefundDocument } from './credit-refund-document';
import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { REGIONAL_DE, REGIONAL_US, REGIONAL_VE } from '@/lib/test/document-regional';

const refund: CreditRefund = {
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

describe('DX-354: el formato de la sede del comprobante', () => {
  const at = (regional: CreditRefund['regional']) => ({ ...refund, regional });

  it('A: sede en-US, la fecha mm/dd/yyyy y el importe con código', () => {
    render(<CreditRefundDocument refund={at(REGIONAL_US)} />);
    const doc = screen.getByTestId('refund-document');
    // 15:00 UTC del 31/10 es el 31/10 en Caracas, que es la zona congelada en el comprobante.
    expect(doc).toHaveTextContent('Emitido 10/31/2026');
    expect(doc.textContent?.replace(/\s/g, ' ')).toContain('USD 40,000.00');
  });

  it('B: sede de-DE, fecha dd.mm.yyyy e importe con código', () => {
    render(<CreditRefundDocument refund={at(REGIONAL_DE)} />);
    const doc = screen.getByTestId('refund-document');
    expect(doc).toHaveTextContent('Emitido 31.10.2026');
    expect(doc.textContent?.replace(/\s/g, ' ')).toContain('40.000,00 USD');
  });

  it('C: sin región, «—» en las fechas y los importes, sin símbolo', () => {
    render(<CreditRefundDocument refund={at(null)} />);
    const doc = screen.getByTestId('refund-document');
    expect(doc).toHaveTextContent('Emitido —');
    const text = doc.textContent ?? '';
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).not.toMatch(/\d[.,]\d{2}/);
    expect(text).not.toContain('US$');
  });
});

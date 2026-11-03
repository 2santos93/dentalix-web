import { render, screen } from '@testing-library/react';
import { CreditRefundDocument } from './credit-refund-document';
import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { REGIONAL_DE, REGIONAL_US } from '@/lib/test/document-regional';
import { refundFixture } from '@/lib/test/credit-refund';

const refund: CreditRefund = refundFixture();

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

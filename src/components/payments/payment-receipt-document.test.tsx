import { render, screen } from '@testing-library/react';
import { PaymentReceiptDocument } from './payment-receipt-document';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';

function text(node: HTMLElement): string {
  return (node.textContent ?? '').replace(/\s/g, ' ');
}

it('lleva el número, la clínica y la sede, el paciente enmascarado, el abono, el saldo y quién cobró', () => {
  render(<PaymentReceiptDocument receipt={paymentReceiptFixture()} />);

  expect(screen.getByRole('heading', { level: 1, name: /recibo de caja/i })).toBeInTheDocument();
  const doc = screen.getByTestId('receipt-document');
  expect(doc).toHaveTextContent('N.º NOR-000123');
  expect(doc).toHaveTextContent('Clínica Sonrisas');
  expect(doc).toHaveTextContent('Sede Norte · Calle 100 # 15-20');
  expect(doc).toHaveTextContent('Carolina Duque');
  expect(doc).toHaveTextContent('ID local ******5678');
  expect(text(doc)).toContain('150.000,00 COP');
  expect(doc).toHaveTextContent('Efectivo');
  expect(doc).toHaveTextContent('17/10/2026');
  expect(doc).toHaveTextContent('Opción A: implante');
  expect(text(doc)).toContain('450.000,00 COP');
  expect(doc).toHaveTextContent('Rita Recepción');
  expect(doc).toHaveTextContent('Este documento no es factura');
  expect(screen.queryByText(/anulado/i)).not.toBeInTheDocument();
});

it('sin razón social o NIT/NIF avisa «Datos fiscales pendientes» y el recibo sale igual', () => {
  render(<PaymentReceiptDocument receipt={paymentReceiptFixture()} />);
  expect(screen.getByText('Datos fiscales pendientes')).toBeInTheDocument();
});

it('con datos fiscales muestra razón social, NIT/NIF y dirección de la clínica', () => {
  const receipt = paymentReceiptFixture();
  render(
    <PaymentReceiptDocument
      receipt={{
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          fiscalDataPending: false,
          clinic: {
            name: 'Clínica Sonrisas',
            legalName: 'Sonrisas S.A.S.',
            taxId: '900123456-7',
            address: 'Cra 7 # 72-10, Bogotá',
          },
        },
      }}
    />,
  );
  const doc = screen.getByTestId('receipt-document');
  expect(doc).toHaveTextContent('Sonrisas S.A.S.');
  expect(doc).toHaveTextContent('NIT/NIF 900123456-7');
  expect(doc).toHaveTextContent('Cra 7 # 72-10, Bogotá');
  expect(screen.queryByText('Datos fiscales pendientes')).not.toBeInTheDocument();
});

it('un abono anulado conserva su número y sale marcado ANULADO con motivo y fecha', () => {
  render(
    <PaymentReceiptDocument
      receipt={paymentReceiptFixture({
        voided: true,
        voidedAt: '2026-10-18T15:30:00.000Z',
        voidReason: 'Cobro duplicado',
      })}
    />,
  );
  const stamp = screen.getByTestId('receipt-voided');
  expect(stamp).toHaveTextContent('ANULADO');
  expect(stamp).toHaveTextContent('Cobro duplicado');
  expect(stamp).toHaveTextContent('18/10/2026');
  expect(screen.getByTestId('receipt-document')).toHaveTextContent('N.º NOR-000123');
});

it('un abono anterior a la numeración muestra su referencia antigua y que es «sin serie»', () => {
  render(
    <PaymentReceiptDocument
      receipt={paymentReceiptFixture({
        reference: 'REC-3f1c2b9e',
        seriesPrefix: null,
        number: null,
        legacy: true,
      })}
    />,
  );
  const doc = screen.getByTestId('receipt-document');
  expect(doc).toHaveTextContent('N.º REC-3f1c2b9e');
  expect(doc).toHaveTextContent('Sin serie');
  expect(doc).toHaveTextContent('Abono registrado el');
  expect(doc).not.toHaveTextContent('Emitido');
});

it('sin documento ni saldo no inventa datos', () => {
  const receipt = paymentReceiptFixture();
  render(
    <PaymentReceiptDocument
      receipt={{
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          patient: { ...receipt.snapshot.patient, docNumberMasked: null },
          planBalance: null,
          cashier: null,
        },
      }}
    />,
  );
  const doc = screen.getByTestId('receipt-document');
  expect(doc).not.toHaveTextContent('ID local');
  expect(doc).toHaveTextContent('Saldo del plan tras este abono');
  expect(doc).toHaveTextContent('No disponible');
});

it('la tirilla de 80 mm marca su formato para la impresión', () => {
  render(<PaymentReceiptDocument receipt={paymentReceiptFixture()} format="80mm" />);
  expect(screen.getByTestId('receipt-document')).toHaveAttribute('data-format', '80mm');
});

it('DX-262: el recibo de un abono al saldo migrado dice su concepto y su fecha de corte', () => {
  const receipt = paymentReceiptFixture();
  render(
    <PaymentReceiptDocument
      receipt={{
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          plan: null,
          openingBalance: {
            id: 'ob-1',
            concept: 'Ortodoncia 2025',
            asOfDate: '2026-03-15',
          },
        },
      }}
    />,
  );
  expect(screen.getByTestId('receipt-document')).toHaveTextContent(
    'Saldo migrado · Ortodoncia 2025 · corte 15/03/2026',
  );
  // Revisión N1 / QA D2: sin plan, el saldo es lo que queda del migrado.
  expect(screen.getByText('Saldo pendiente tras este abono')).toBeInTheDocument();
  expect(screen.queryByText(/Saldo del plan/)).not.toBeInTheDocument();
});

it('prints the docTypeName of the DTO, or the generic name when it is missing', () => {
  const receipt = paymentReceiptFixture();
  const { rerender } = render(<PaymentReceiptDocument receipt={receipt} />);
  expect(screen.getByTestId('receipt-document')).toHaveTextContent('ID local ******5678');

  // API anterior en el hueco del despliegue: sin `docTypeName`, el genérico.
  const { docTypeName: _omit, ...withoutName } = receipt.snapshot.patient;
  void _omit;
  rerender(
    <PaymentReceiptDocument
      receipt={{
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          patient: { ...withoutName, docType: 'TAX_ID' } as typeof receipt.snapshot.patient,
        },
      }}
    />,
  );
  const doc = screen.getByTestId('receipt-document');
  expect(doc).toHaveTextContent('Identificación fiscal ******5678');
  expect(doc).not.toHaveTextContent('TAX_ID');
});

import { render, screen } from '@testing-library/react';
import { PaymentReceiptDocument } from './payment-receipt-document';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import type { PaymentReceipt } from '@/lib/payments/payment-receipts-api';

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

// «NIT/NIF» es la línea que el recibo imprime hoy (payment-receipt-document.tsx,
// excepción con nombre de la guarda de DX-327); se va con DX-019.
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

describe('DX-376: abono en otra moneda', () => {
  const inVes = (exchangeRate: PaymentReceipt['exchangeRate']) => {
    const receipt = paymentReceiptFixture({ exchangeRate });
    return {
      ...receipt,
      snapshot: {
        ...receipt.snapshot,
        payment: { ...receipt.snapshot.payment, amount: 1825, currency: 'VES' },
        planBalance: { currency: 'USD', billable: 1000, paid: 50, balance: 950 },
      },
    };
  };
  const FROZEN: PaymentReceipt['exchangeRate'] = {
    status: 'FROZEN',
    rate: { currency: 'USD', fromPerBase: 36.5, toPerBase: 1, source: 'MANUAL', date: '2026-10-29' },
    equivalentAmount: 50,
  };

  it('imprime el importe cobrado, el equivalente en la moneda del plan y «Tasa aplicada: Z (fuente, fecha)»', () => {
    render(<PaymentReceiptDocument receipt={inVes(FROZEN)} />);
    const doc = text(screen.getByTestId('receipt-document'));
    expect(doc).toContain('1825,00 VES');
    expect(doc).toContain('Equivalente en USD');
    expect(doc).toContain('50,00 US$');
    expect(doc).toContain('Tasa aplicada: 1 USD = 36,50 VES (manual, 29/10/2026)');
  });

  it('la tasa sale de la congelada del abono: con otra tasa congelada imprime otra (reimprimir no la recalcula)', () => {
    const other: PaymentReceipt['exchangeRate'] = {
      status: 'FROZEN',
      rate: { currency: 'USD', fromPerBase: 40, toPerBase: 1, source: 'AUTOMATIC', date: '2026-10-30' },
      equivalentAmount: 45.63,
    };
    render(<PaymentReceiptDocument receipt={inVes(other)} />);
    const doc = text(screen.getByTestId('receipt-document'));
    expect(doc).toContain('Tasa aplicada: 1 USD = 40,00 VES (automática, 30/10/2026)');
    expect(doc).toContain('45,63 US$');
  });

  it('un abono «sin tasa» lo dice en lugar de la tasa y el equivalente', () => {
    render(
      <PaymentReceiptDocument receipt={inVes({ status: 'MISSING', rate: null, equivalentAmount: null })} />,
    );
    const doc = text(screen.getByTestId('receipt-document'));
    expect(doc).toContain('Tasa aplicada: sin tasa de cambio de su día');
    expect(doc).not.toContain('Equivalente en');
  });

  it('en la moneda del plan no imprime tasa ni equivalente', () => {
    render(<PaymentReceiptDocument receipt={paymentReceiptFixture()} />);
    expect(screen.queryByText(/tasa aplicada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/equivalente en/i)).not.toBeInTheDocument();
  });

  it('ningún texto nombra un país ni un banco central', () => {
    render(<PaymentReceiptDocument receipt={inVes(FROZEN)} />);
    expect(text(screen.getByTestId('receipt-document'))).not.toMatch(/venezuela|bcv|banco central/i);
  });
});

it('DX-377: el recibo muestra el medio de pago de la clínica y la referencia', () => {
  const receipt = paymentReceiptFixture();
  render(
    <PaymentReceiptDocument
      receipt={{
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          payment: {
            ...receipt.snapshot.payment,
            method: 'TRANSFER',
            paymentMethodName: 'Pago móvil',
            reference: '0412 555',
          },
        },
      }}
    />,
  );
  const doc = screen.getByTestId('receipt-document');
  expect(doc).toHaveTextContent('Pago móvil');
  expect(doc).toHaveTextContent('Referencia');
  expect(doc).toHaveTextContent('0412 555');
});

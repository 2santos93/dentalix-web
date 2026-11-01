import { render } from '@testing-library/react';
import { PaymentReceiptDocument } from './payment-receipt-document';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import type { PaymentReceipt } from '@/lib/payments/payment-receipts-api';

/**
 * DX-515: el recibo de una clínica que no configuró leyenda ni título sale
 * IGUAL que antes, byte a byte. Las fotos de `__snapshots__` se generaron con
 * el componente de antes de DX-515 (commit propio, previo al cambio) y no se
 * regeneran: `jest --ci` falla si faltan, y cualquier diferencia de marcado
 * (una clase, un nodo vacío, un espacio) las pone en rojo.
 */
function html(receipt: PaymentReceipt, format: 'a4' | '80mm'): string {
  const { container } = render(<PaymentReceiptDocument receipt={receipt} format={format} />);
  return container.innerHTML;
}

/** Un recibo con todo: datos fiscales, referencia, cobro dividido y anulado. */
function fullReceipt(): PaymentReceipt {
  const base = paymentReceiptFixture();
  return {
    ...base,
    voided: true,
    voidedAt: '2026-10-18T10:00:00.000Z',
    voidReason: 'Cobro duplicado',
    split: {
      lines: [
        {
          paymentId: 'pay-1',
          line: 1,
          amount: 100000,
          currency: 'COP',
          method: 'CASH',
          paymentMethodName: 'Efectivo',
          reference: null,
          equivalentAmount: 100000,
          exchangeRate: null,
        },
        {
          paymentId: 'pay-2',
          line: 2,
          amount: 20,
          currency: 'USD',
          method: 'TRANSFER',
          paymentMethodName: 'Transferencia',
          reference: 'TRX-889',
          equivalentAmount: 80000,
          exchangeRate: null,
        },
      ],
      total: { currency: 'COP', amount: 180000 },
    },
    snapshot: {
      ...base.snapshot,
      fiscalDataPending: false,
      clinic: { name: 'Clínica Sonrisas', legalName: 'Sonrisas S.A.', taxId: 'J-123', address: 'Av. Principal 1' },
      payment: { ...base.snapshot.payment, paymentMethodName: 'Efectivo', reference: 'R-1' },
    },
  };
}

describe('recibo sin leyenda ni título configurados: igual que antes (DX-515)', () => {
  it('A4', () => {
    expect(html(paymentReceiptFixture(), 'a4')).toMatchSnapshot();
  });

  it('80 mm', () => {
    expect(html(paymentReceiptFixture(), '80mm')).toMatchSnapshot();
  });

  it('A4 con datos fiscales, cobro dividido y anulado', () => {
    expect(html(fullReceipt(), 'a4')).toMatchSnapshot();
  });

  it('80 mm con datos fiscales, cobro dividido y anulado', () => {
    expect(html(fullReceipt(), '80mm')).toMatchSnapshot();
  });
});

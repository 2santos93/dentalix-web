import { render, screen } from '@testing-library/react';
import { regionalFormat } from '@/lib/format/regional-format';
import type { Payment } from '@/lib/payments/payments-api';
import { PlanPaymentsList } from './plan-payments-list';

const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h23' });

function payment(over: Partial<Payment>): Payment {
  return {
    id: 'pay-1',
    amount: 200000,
    currency: 'VES',
    paidOn: '2026-10-30',
    method: 'CASH',
    receiptNumber: 'PRI-000001',
    notes: null,
    exchangeRateStatus: 'MISSING',
    ...over,
  } as Payment;
}

/**
 * DX-394: la lista de abonos con el distintivo «Sin tasa» (y el de imputación
 * manual) no anida bloques en un `<p>` ni deja a React avisar de hidratación o
 * anidación (el aviso sale por `console.error`). Importe con código ISO.
 */
describe('PlanPaymentsList: sin avisos de anidación (DX-394)', () => {
  it('un abono sin tasa e imputado a mano se pinta sin avisos de React y sin símbolo de moneda', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <PlanPaymentsList
        payments={[payment({})]}
        voidingPaymentId={null}
        onVoid={jest.fn()}
        onReceipt={jest.fn()}
        manualPaymentIds={new Set(['pay-1'])}
        fmt={fmt}
      />,
    );
    expect(screen.getAllByText(/^Sin tasa/).length).toBeGreaterThan(0);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    // Ningún bloque dentro de un <p>.
    expect(container.querySelectorAll('p div, p ul, p table, p p')).toHaveLength(0);
    expect(container).not.toHaveTextContent('US$');
    expect(container).not.toHaveTextContent('Bs.');
    errors.mockRestore();
  });
});

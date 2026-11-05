import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/**
 * DX-414: la pestaña Plan dice el medio REAL del abono (el de la clínica, con
 * su referencia) y no el método antiguo, que llama «Transferencia» al pago móvil.
 */
describe('PlanPaymentsList: medio real del abono (DX-414)', () => {
  function renderList(payments: Payment[]) {
    return render(
      <PlanPaymentsList
        payments={payments}
        voidingPaymentId={null}
        onVoid={jest.fn()}
        onReceipt={jest.fn()}
        fmt={fmt}
      />,
    );
  }

  it('«Pago móvil» y su referencia, no «Transferencia»', () => {
    renderList([
      payment({
        method: 'TRANSFER',
        paymentMethodName: 'Pago móvil',
        reference: 'PM 123456',
        exchangeRateStatus: 'NOT_NEEDED',
      }),
    ]);
    expect(screen.getAllByText(/Pago móvil/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ref\. PM 123456/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Transferencia')).not.toBeInTheDocument();
  });

  it('sin medio de la clínica, el método antiguo', () => {
    renderList([payment({ method: 'CASH', paymentMethodName: null, exchangeRateStatus: 'NOT_NEEDED' })]);
    expect(screen.getAllByText('Efectivo').length).toBeGreaterThan(0);
  });

  it('las líneas de un cobro dividido llevan el distintivo con el recibo único', () => {
    renderList([
      payment({ id: 'a', splitId: 'a', exchangeRateStatus: 'NOT_NEEDED', receiptNumber: 'PRI-000007' }),
      payment({ id: 'b', splitId: 'a', exchangeRateStatus: 'NOT_NEEDED', receiptNumber: 'PRI-000007' }),
      payment({ id: 'c', splitId: null, exchangeRateStatus: 'NOT_NEEDED', receiptNumber: 'PRI-000008' }),
    ]);
    expect(screen.getAllByText('Cobro dividido · 2 formas · PRI-000007').length).toBeGreaterThan(0);
    expect(screen.queryByText(/PRI-000008.*dividido/)).not.toBeInTheDocument();
  });
});

// DX-384: la lista de abonos dice «tasa del 30/10/2026» cuando la tasa
// congelada es la última registrada, de un día anterior al del abono.
function frozenPayment(over: Partial<Payment> = {}): Payment {
  return payment({
    amount: 3650,
    paidOn: '2026-10-31',
    receiptNumber: 'PRI-000007',
    exchangeRateCurrency: 'USD',
    exchangeRateStatus: 'FROZEN',
    frozenRate: { currency: 'USD', fromPerBase: 36.5, toPerBase: 1, source: 'MANUAL', date: '2026-10-30' },
    ...over,
  });
}

function renderList(p: Payment) {
  render(
    <PlanPaymentsList payments={[p]} voidingPaymentId={null} onVoid={jest.fn()} onReceipt={jest.fn()} fmt={fmt} />,
  );
}

describe('PlanPaymentsList: día de la tasa congelada (DX-384)', () => {
  it('la tasa de un día anterior al del abono se lee «tasa del …»', () => {
    renderList(frozenPayment());
    expect(screen.getAllByText(/Tasa congelada: .* · manual · tasa del 30\/10\/2026/).length).toBeGreaterThan(0);
  });

  it('la tasa del propio día sigue con el día tal cual', () => {
    renderList(
      frozenPayment({
        frozenRate: { currency: 'USD', fromPerBase: 36.5, toPerBase: 1, source: 'MANUAL', date: '2026-10-31' },
      }),
    );
    expect(screen.getAllByText(/Tasa congelada: .* · manual · 31\/10\/2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/tasa del/)).not.toBeInTheDocument();
  });
});

/**
 * DX-389: «Ver comprobante» en el «⋯» del abono, solo si lo tiene y solo si la
 * pantalla lo permite (ADMIN y recepción: sin `onViewProof`, no hay acción).
 */
describe('PlanPaymentsList: comprobante del cobro (DX-389)', () => {
  function renderList(payments: Payment[], onViewProof?: (p: Payment) => void) {
    return render(
      <PlanPaymentsList
        payments={payments}
        voidingPaymentId={null}
        onVoid={jest.fn()}
        onReceipt={jest.fn()}
        onViewProof={onViewProof}
        fmt={fmt}
      />,
    );
  }
  const menuOf = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole('button', { name: /^Acciones de abono/ })[0]);
    return screen.findAllByRole('menuitem');
  };

  it('un abono con comprobante ofrece «Ver comprobante» y lo abre con su id', async () => {
    const user = userEvent.setup();
    const onViewProof = jest.fn();
    renderList([payment({ hasProof: true, exchangeRateStatus: 'NOT_NEEDED' })], onViewProof);
    const items = await menuOf(user);
    expect(items.map((i) => i.textContent)).toContain('Ver comprobante');
    await user.click(screen.getByRole('menuitem', { name: 'Ver comprobante' }));
    expect(onViewProof).toHaveBeenCalledWith(expect.objectContaining({ id: 'pay-1' }));
  });

  it('sin comprobante, o sin permiso, no hay acción', async () => {
    const user = userEvent.setup();
    const first = renderList([payment({ hasProof: false, exchangeRateStatus: 'NOT_NEEDED' })], jest.fn());
    expect((await menuOf(user)).map((i) => i.textContent)).not.toContain('Ver comprobante');
    first.unmount();
    renderList([payment({ hasProof: true, exchangeRateStatus: 'NOT_NEEDED' })]);
    expect((await menuOf(user)).map((i) => i.textContent)).not.toContain('Ver comprobante');
  });
});

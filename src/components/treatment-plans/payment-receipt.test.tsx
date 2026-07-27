import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentReceipt } from './payment-receipt';
import type { Payment, PlanBalance } from '@/lib/payments/payments-api';

const payment: Payment = {
  id: 'a1b2c3d4-1111-2222-3333-444455556666',
  tenantId: 't1',
  treatmentPlanId: 'plan-1',
  patientId: 'pat-1',
  amount: 50000,
  currency: 'USD',
  paidAt: '2026-01-05T00:00:00.000Z',
  method: 'CASH',
  notes: 'Pago inicial',
  createdById: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

// `paid`/`balance` are deliberately different from `payment.amount` (50000)
// so the "Abono" section's monto and the "Saldo del plan" section's figures
// never collide on the same rendered text.
const balance: PlanBalance = {
  planCurrency: 'USD',
  billable: 130000,
  paid: 60000,
  balance: 70000,
  paymentsCount: 2,
};

const currencyFormatter = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
/** Same NBSP-normalization rationale as `treatment-plans-tab.test.tsx`'s `expectedCurrencyText`. */
function expectedCurrencyText(amount: number): string {
  return currencyFormatter.format(amount).replace(/ /g, ' ');
}

describe('PaymentReceipt', () => {
  it('is closed (renders nothing) when payment is null', () => {
    render(
      <PaymentReceipt
        payment={null}
        planBalance={balance}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName="Ana García"
        clinicName="Clínica Sonrisa"
        onOpenChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Comprobante de abono')).not.toBeInTheDocument();
  });

  it('renders clinic, patient, plan, amount+currency, method, and balance (all in planCurrency) when open', () => {
    render(
      <PaymentReceipt
        payment={payment}
        planBalance={balance}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName="Ana García"
        clinicName="Clínica Sonrisa"
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Comprobante de abono')).toBeInTheDocument();
    expect(screen.getByText('Clínica Sonrisa')).toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('Plan del 1/1/2026 — Borrador')).toBeInTheDocument();
    expect(screen.getByText(expectedCurrencyText(payment.amount))).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Pago inicial')).toBeInTheDocument();
    expect(screen.getByText(expectedCurrencyText(balance.billable))).toBeInTheDocument();
    expect(screen.getByText(expectedCurrencyText(balance.paid))).toBeInTheDocument();
    expect(screen.getByText(expectedCurrencyText(balance.balance))).toBeInTheDocument();
    // Reference = REC-<first 8 chars of payment.id>.
    expect(screen.getByText(/REC-a1b2c3d4/)).toBeInTheDocument();
  });

  it('falls back gracefully when clinicName/patientName/notes/method are missing', () => {
    render(
      <PaymentReceipt
        payment={{ ...payment, method: null, notes: null }}
        planBalance={balance}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName={null}
        clinicName={null}
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Comprobante de abono')).toBeInTheDocument();
    // No clinic line rendered at all (not even an empty one) when clinicName is null.
    expect(screen.queryByText('Clínica Sonrisa')).not.toBeInTheDocument();
    // Fallback dashes for the missing patient/método/notas.
    const fallbacks = screen.getAllByText('—');
    expect(fallbacks.length).toBeGreaterThanOrEqual(3);
  });

  it('omits the balance section when planBalance is null, without crashing', () => {
    render(
      <PaymentReceipt
        payment={payment}
        planBalance={null}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName="Ana García"
        clinicName="Clínica Sonrisa"
        onOpenChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Saldo del plan (al momento de emitir)')).not.toBeInTheDocument();
  });

  it('"Imprimir" calls window.print', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <PaymentReceipt
        payment={payment}
        planBalance={balance}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName="Ana García"
        clinicName="Clínica Sonrisa"
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^imprimir$/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('"Cerrar" calls onOpenChange(false)', async () => {
    const onOpenChange = jest.fn();
    const user = userEvent.setup();
    render(
      <PaymentReceipt
        payment={payment}
        planBalance={balance}
        planLabel="Plan del 1/1/2026 — Borrador"
        patientName="Ana García"
        clinicName="Clínica Sonrisa"
        onOpenChange={onOpenChange}
      />,
    );

    // Scoped to the receipt's own action bar (`.receipt-print-hide`) — the
    // Dialog primitive's corner "X" close button also carries an
    // accessible name of "Cerrar" (sr-only text in `ui/dialog.tsx`), so an
    // unscoped query would match two buttons.
    const actions = document.querySelector('.receipt-print-hide') as HTMLElement;
    await user.click(within(actions).getByRole('button', { name: /^cerrar$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

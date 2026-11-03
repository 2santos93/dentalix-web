import { render, screen } from '@testing-library/react';
import { BillablePlanField } from './billable-plan-field';
import type { BillablePlan } from '@/lib/payments/billable-plans-api';

const money = (amount: number, currency: string) => `${currency} ${amount}`;

function plan(overrides: Partial<BillablePlan> = {}): BillablePlan {
  return {
    id: 'plan-1',
    status: 'ACCEPTED',
    currency: 'USD',
    createdAt: '2026-10-01T12:00:00.000Z',
    total: 300,
    paid: 100,
    paidOtherCurrencies: [{ currency: 'VES', amount: 3600 }],
    balance: 200,
    hasActivePaymentPlan: false,
    paymentsWithoutRate: [],
    rateProviderTimedOut: false,
    ...overrides,
  };
}

function renderField(p: BillablePlan) {
  render(
    <BillablePlanField
      id="plan"
      state={{ plans: [p], loading: false, failed: false, retry: jest.fn() }}
      value={p.id}
      onChange={jest.fn()}
      money={money}
    />,
  );
}

describe('BillablePlanField (DX-472-bis)', () => {
  it('lo entregado en otra moneda ya cuenta en el abonado: el saldo es el del estado de cuenta', () => {
    renderField(plan());
    expect(screen.getByText(/Saldo USD 200 · Total USD 300 · Abonado USD 100/)).toBeInTheDocument();
    expect(screen.getByText('Entregado en otra moneda: VES 3600')).toBeInTheDocument();
    expect(screen.queryByText(/Sin contar/)).not.toBeInTheDocument();
  });

  it('un abono «sin tasa» se dice, sin culpar al proveedor', () => {
    renderField(
      plan({
        paid: 0,
        balance: 300,
        paymentsWithoutRate: [
          {
            paymentId: 'p1',
            amount: 3600,
            currency: 'VES',
            paidOn: '2026-10-14',
          },
        ],
      }),
    );
    expect(screen.getByText('Sin contar 1 abono en otra moneda: falta la tasa de su día.')).toBeInTheDocument();
  });

  it('con el proveedor sin responder, lo dice', () => {
    renderField(
      plan({
        paid: 0,
        balance: 300,
        rateProviderTimedOut: true,
        paymentsWithoutRate: [
          {
            paymentId: 'p1',
            amount: 1800,
            currency: 'VES',
            paidOn: '2026-10-14',
          },
          {
            paymentId: 'p2',
            amount: 1800,
            currency: 'VES',
            paidOn: '2026-10-15',
          },
        ],
      }),
    );
    expect(
      screen.getByText('Sin contar 2 abonos en otra moneda: el proveedor de tasas no respondió.'),
    ).toBeInTheDocument();
  });
});

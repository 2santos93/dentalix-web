import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rateProviderCopy } from '@/components/payments/rate-provider-notice';
import { withoutRateCopy } from '@/components/payments/without-rate-notice';
import type { PlanBalance } from '@/lib/payments/payments-api';
import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import { PlanMoneySummary } from './plan-money-summary';
import { BALANCE_WITHOUT_ALLOCATIONS } from './plan-fixture';

jest.mock('../payments/without-rate-notice', () => ({
  ...jest.requireActual('../payments/without-rate-notice'),
  WithoutRateNotice: () => <p>aviso sin tasa</p>,
}));

const withoutRate = { paymentId: 'p1', amount: 3600, currency: 'VES', paidOn: '2026-10-30' };
const balance = (overrides: Partial<PlanBalance>): PlanBalance => ({
  ...BALANCE_WITHOUT_ALLOCATIONS,
  planCurrency: 'USD',
  billable: 300,
  paid: 50,
  creditMovements: 0,
  balance: 250,
  paymentsCount: 2,
  ...overrides,
});

function renderSummary(value: PlanBalance, onRetryBalance = jest.fn(), fmt: RegionalFormat | null = null) {
  render(
    <PlanMoneySummary
      token="t"
      total={300}
      currency="USD"
      balance={value}
      fmt={fmt}
      onRetryBalance={onRetryBalance}
      retryingBalance={false}
    />,
  );
}

describe('PlanMoneySummary: «sin tasa» frente a «el proveedor no respondió» (DX-472)', () => {
  it('sin tasa: el aviso de la tasa que falta, sin «Reintentar»', () => {
    renderSummary(balance({ paymentsWithoutRate: [withoutRate] }));
    expect(screen.getByText('aviso sin tasa')).toBeInTheDocument();
    expect(screen.queryByText(rateProviderCopy.title)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: rateProviderCopy.retry })).not.toBeInTheDocument();
  });

  it('el proveedor no respondió: pide reintentar y no propone registrar una tasa', async () => {
    const onRetry = jest.fn();
    renderSummary(balance({ paymentsWithoutRate: [withoutRate], rateProviderTimedOut: true }), onRetry);

    expect(screen.getByText(rateProviderCopy.title)).toBeInTheDocument();
    expect(screen.queryByText('aviso sin tasa')).not.toBeInTheDocument();
    expect(screen.queryByText(withoutRateCopy.title(1))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: rateProviderCopy.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('PlanMoneySummary: lo recibido por traspaso a cuenta (DX-399-quater-bis)', () => {
  const ES_VE = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

  it('con saldo recibido que no cubre ningún ítem, una fila que lo explica', () => {
    renderSummary(balance({ transfersInOnAccount: 30 }), jest.fn(), ES_VE);
    const label = screen.getByText('Saldo recibido por traspaso, a cuenta');
    expect(label.tagName).toBe('DT');
    expect(label.parentElement).toHaveTextContent(/USD\s30,00/);
    expect(screen.getByText('Llegó de otro plan del paciente y todavía no cubre ningún ítem.')).toBeInTheDocument();
  });

  it('sin traspasos (la API lo omite), la fila no sale', () => {
    renderSummary(balance({}), jest.fn(), ES_VE);
    expect(screen.queryByText(/por traspaso/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Total', 'A pagar', 'Pagado', 'Saldo']);
  });
});

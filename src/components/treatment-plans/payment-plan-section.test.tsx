import { render, screen, within } from '@testing-library/react';
import { PaymentPlanSection } from './payment-plan-section';
import { getPaymentPlan, type PaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  ...jest.requireActual('../../lib/payment-plans/payment-plan-api'),
  getPaymentPlan: jest.fn(),
  deletePaymentPlan: jest.fn(),
}));
const mockedGet = getPaymentPlan as jest.MockedFunction<typeof getPaymentPlan>;

const PLAN = {
  id: 'pp-1',
  treatmentPlanId: 'plan-1',
  currency: 'USD',
  status: 'ACTIVE',
  totalToFinance: 600,
  downPayment: 0,
  financedAmount: 600,
  installmentsCount: 2,
  periodicity: 'MONTHLY',
  startDate: '2026-11-05',
  billable: 600,
  paid: 0,
  creditMovements: 0,
  balance: 600,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
  paidTotal: 0,
  remaining: 600,
  downPaymentStatus: null,
  installments: [
    { sequence: 1, dueDate: '2026-11-05T00:00:00.000Z', amount: 300, covered: 0, status: 'PENDING' },
    { sequence: 2, dueDate: '2026-12-05T00:00:00.000Z', amount: 300, covered: 0, status: 'PENDING' },
  ],
  nextDue: { sequence: null, dueDate: '2026-11-05T00:00:00.000Z', amount: 300 },
  overdueCount: 0,
  overdueAmount: 0,
  isFullyPaid: false,
} as unknown as PaymentPlan;

function renderSection(fmt: ReturnType<typeof regionalFormat> | null) {
  return render(
    <PaymentPlanSection
      token="tok"
      planId="plan-1"
      planCurrency="USD"
      billable={600}
      refreshSignal={0}
      fmt={fmt}
      onRetryBalance={jest.fn()}
    />,
  );
}

describe('PaymentPlanSection: fechas de las cuotas (DX-354b)', () => {
  beforeEach(() => mockedGet.mockResolvedValue(PLAN));

  it.each([
    ['es-VE', 'h12'],
    ['en-US', 'h12'],
    ['de-DE', 'h23'],
  ] as const)('el vencimiento sale con el formato de la sede %s (día civil, sin zona)', async (locale, hourCycle) => {
    const fmt = regionalFormat({ locale, hourCycle });
    renderSection(fmt);
    const table = await screen.findByRole('table');
    expect(within(table).getByText(fmt.civilDate('2026-11-05'))).toBeInTheDocument();
    expect(within(table).getByText(fmt.civilDate('2026-12-05'))).toBeInTheDocument();
  });

  it('sin formato de la sede, «—» y nunca dd/mm/aaaa', async () => {
    renderSection(null);
    const table = await screen.findByRole('table');
    expect(table).not.toHaveTextContent(/\d{2}[/.]\d{2}[/.]\d{4}/);
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });
});

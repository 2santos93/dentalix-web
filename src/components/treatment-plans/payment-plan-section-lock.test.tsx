import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentPlanSection } from './payment-plan-section';
import { deletePaymentPlan, getPaymentPlan, type PaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';
import { ApiError } from '@/lib/api/client';
import { regionalFormat } from '@/lib/format/regional-format';
import { periodLockCopy } from '@/components/payments/period-lock-field';

jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  ...jest.requireActual('../../lib/payment-plans/payment-plan-api'),
  getPaymentPlan: jest.fn(),
  deletePaymentPlan: jest.fn(),
}));
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));
const mockedGet = jest.mocked(getPaymentPlan);
const mockedDelete = jest.mocked(deletePaymentPlan);
const mockedLock = jest.mocked(getPeriodLock);

// La primera cuota venció el 05/09, dentro del cierre (hasta el 30/09).
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
  startDate: '2026-09-05',
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
    { sequence: 1, dueDate: '2026-09-05T00:00:00.000Z', amount: 300, covered: 0, status: 'OVERDUE' },
    { sequence: 2, dueDate: '2026-10-05T00:00:00.000Z', amount: 300, covered: 0, status: 'OVERDUE' },
  ],
  nextDue: { sequence: 1, dueDate: '2026-09-05T00:00:00.000Z', amount: 300 },
  overdueCount: 2,
  overdueAmount: 600,
  isFullyPaid: false,
} as unknown as PaymentPlan;

const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

beforeEach(() => {
  mockedGet.mockReset().mockResolvedValue(PLAN);
  mockedDelete.mockReset();
  mockedLock.mockReset();
});

function renderSection() {
  render(
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

async function openCancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Cancelar plan' }));
  return screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
}

describe('DX-091 · cancelar un plan de cuotas con cuotas en un período cerrado', () => {
  it('sin poder saltarlo, lo explica; el 409 de la API sale en español con el día del cierre', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: false });
    const message =
      'El plan de cuotas tiene cuotas vencidas en un período contable cerrado: ya no se puede cancelar. Pide a administración que lo revise.';
    mockedDelete.mockRejectedValue(new ApiError(409, message, { code: 'PERIOD_LOCKED', lockedThrough: '2026-09-30' }));
    const user = userEvent.setup();
    renderSection();
    const dialog = await openCancel(user);
    await waitFor(() => expect(dialog).toHaveTextContent(/período contable cerrado: ya no se puede cancelar/));
    expect(screen.queryByLabelText(periodLockCopy.planCancelReasonLabel)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByText(`${message} Cerrado hasta el ${fmt.civilDate('2026-09-30')}, inclusive.`)).toBeInTheDocument();
  });

  it('el ADMIN con la exención indica el motivo, que viaja a la API', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: true });
    mockedDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection();
    await openCancel(user);
    const reason = await screen.findByLabelText(periodLockCopy.planCancelReasonLabel);
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByText(periodLockCopy.reasonMissing)).toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
    await user.type(reason, 'El paciente pagó todo de contado');
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'plan-1', 'El paciente pagó todo de contado'));
  });
});

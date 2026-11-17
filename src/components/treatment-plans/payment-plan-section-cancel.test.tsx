import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentPlanSection } from './payment-plan-section';
import {
  deletePaymentPlan,
  getPaymentPlan,
  listCancelledPaymentPlans,
  type CancelledPaymentPlan,
  type PaymentPlan,
} from '@/lib/payment-plans/payment-plan-api';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';
import { regionalFormat } from '@/lib/format/regional-format';
import { cancelPaymentPlanCopy } from '@/components/payment-plans/cancel-payment-plan-modal';
import { cancelledPaymentPlansCopy } from '@/components/payment-plans/cancelled-payment-plans';

jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  ...jest.requireActual('../../lib/payment-plans/payment-plan-api'),
  getPaymentPlan: jest.fn(),
  listCancelledPaymentPlans: jest.fn(),
  deletePaymentPlan: jest.fn(),
}));
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(() =>
    Promise.resolve([jest.requireActual('../../lib/test/locations').clinicLocation()]),
  ),
}));
const mockedGet = jest.mocked(getPaymentPlan);
const mockedHistory = jest.mocked(listCancelledPaymentPlans);
const mockedDelete = jest.mocked(deletePaymentPlan);
const mockedLock = jest.mocked(getPeriodLock);

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
  startDate: '2026-12-05',
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
    { sequence: 1, dueDate: '2026-12-05T00:00:00.000Z', amount: 300, covered: 0, status: 'PENDING' },
    { sequence: 2, dueDate: '2027-01-05T00:00:00.000Z', amount: 300, covered: 0, status: 'PENDING' },
  ],
  nextDue: { sequence: 1, dueDate: '2026-12-05T00:00:00.000Z', amount: 300 },
  overdueCount: 0,
  overdueAmount: 0,
  isFullyPaid: false,
} as unknown as PaymentPlan;

const CANCELLED: CancelledPaymentPlan = {
  id: 'pp-1',
  currency: 'USD',
  totalToFinance: 600,
  downPayment: 100,
  installmentsCount: 2,
  periodicity: 'MONTHLY',
  startDate: '2026-12-05T00:00:00.000Z',
  createdAt: '2026-11-01T14:00:00.000Z',
  cancelledAt: '2026-11-17T15:30:00.000Z',
  cancelledBy: { id: 'u-1', fullName: 'Ana Rodríguez' },
  cancelReason: 'El paciente pagará de contado',
};

const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

beforeEach(() => {
  mockedGet.mockReset().mockResolvedValue(PLAN);
  mockedHistory.mockReset().mockResolvedValue([]);
  mockedDelete.mockReset().mockResolvedValue(undefined);
  mockedLock.mockReset().mockResolvedValue({ lockedThrough: null, canOverride: false });
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

describe('DX-092 (SEC-029) · cancelar el plan de cuotas pide el motivo', () => {
  it('sin motivo (o con menos de 3 caracteres) no llama a la API y lo dice junto al campo', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Cancelar plan' }));
    const reason = await screen.findByLabelText(cancelPaymentPlanCopy.reasonLabel);
    await user.click(screen.getByRole('button', { name: cancelPaymentPlanCopy.submit }));
    expect(await screen.findByText(cancelPaymentPlanCopy.reasonTooShort)).toBeInTheDocument();
    expect(reason).toHaveFocus();
    await user.type(reason, ' a ');
    await user.click(screen.getByRole('button', { name: cancelPaymentPlanCopy.submit }));
    expect(await screen.findByText(cancelPaymentPlanCopy.reasonTooShort)).toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('con motivo lo envía recortado y el cancelado aparece en el historial con fecha, autor y motivo', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Cancelar plan' }));
    await user.type(await screen.findByLabelText(cancelPaymentPlanCopy.reasonLabel), '  El paciente pagará de contado ');
    mockedGet.mockResolvedValue(null);
    mockedHistory.mockResolvedValue([CANCELLED]);
    await user.click(screen.getByRole('button', { name: cancelPaymentPlanCopy.submit }));
    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith('tok', 'plan-1', 'El paciente pagará de contado', undefined),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /Planes de pagos cancelados/ }));
    const item = (await screen.findByText('Cancelado')).closest('li')!;
    expect(item).toHaveTextContent(`Cancelado${fmt.date(new Date(CANCELLED.cancelledAt), 'America/Caracas')}por Ana Rodríguez`);
    expect(item).toHaveTextContent('por Ana Rodríguez');
    expect(item).toHaveTextContent('Motivo: El paciente pagará de contado');
    expect(item).toHaveTextContent('2 cuotas mensuales');
    expect(item).toHaveTextContent('Total USD 600,00 · pie USD 100,00 · 2 cuotas mensuales');
  });
});

describe('DX-123 (O-2) · historial de planes de cuotas cancelados', () => {
  it('sin cancelados no pinta el historial', async () => {
    renderSection();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Planes de pagos cancelados/ })).toBeNull();
  });

  it('plegado con el recuento; un cancelado antes de DX-109 dice que no hay motivo registrado', async () => {
    mockedGet.mockResolvedValue(null);
    mockedHistory.mockResolvedValue([
      CANCELLED,
      { ...CANCELLED, id: 'pp-0', cancelledBy: null, cancelReason: null, installmentsCount: 1, downPayment: 0 },
    ]);
    const user = userEvent.setup();
    renderSection();
    const trigger = await screen.findByRole('button', { name: /Planes de pagos cancelados/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('2 planes');
    await user.click(trigger);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[1]).getByText(cancelledPaymentPlansCopy.noReason)).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('1 cuota mensual');
    expect(items[1]).not.toHaveTextContent('por ');
  });
});

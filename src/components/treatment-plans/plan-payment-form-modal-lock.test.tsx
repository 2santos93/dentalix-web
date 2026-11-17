import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanPaymentFormModal } from './plan-payment-form-modal';
import { recordPayment, type PlanBalance } from '@/lib/payments/payments-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';
import { ApiError } from '@/lib/api/client';
import { regionalFormat } from '@/lib/format/regional-format';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { addDaysIso } from '@/lib/locations/provider-schedule';
import { periodLockCopy } from '@/components/payments/period-lock-field';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';

jest.mock('../../lib/payments/payments-api', () => ({ recordPayment: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'USD', name: 'Dólar', symbol: 'US$', roundingDigits: 2 }]),
}));
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));

const mockedRecord = jest.mocked(recordPayment);
const mockedLock = jest.mocked(getPeriodLock);
const TODAY = sedeToday('America/Caracas');
const YESTERDAY = addDaysIso(TODAY, -1);
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

const plan = { id: 'plan-1', currency: 'USD' } as unknown as TreatmentPlan;
const balance = { balance: 500, paymentsWithoutRate: [], rateProviderTimedOut: false } as unknown as PlanBalance;

beforeEach(() => {
  jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
  mockedRecord.mockReset();
  mockedLock.mockReset().mockResolvedValue({ lockedThrough: YESTERDAY, canOverride: false });
});

function renderModal() {
  render(
    <PlanPaymentFormModal
      token="tok"
      open
      onOpenChange={jest.fn()}
      plan={plan}
      planBalance={balance}
      onRetryBalance={jest.fn()}
      sedeZone={{ status: 'ready', timeZone: 'America/Caracas' }}
      sedeFmt={fmt}
      locationHint={null}
      onRecorded={jest.fn()}
    />,
  );
}

describe('DX-091 · cierre contable en «Registrar abono» del plan de tratamiento', () => {
  it('el selector de fecha no ofrece días cerrados y explica por qué', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(await screen.findByText(periodLockCopy.hint(fmt.civilDate(YESTERDAY)))).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: /^fecha$/i })).getByRole('button'));
    const first = await screen.findByRole('button', { name: /Primera fecha disponible/ });
    const cells = Array.from(document.querySelectorAll('[role="grid"] [role="gridcell"]'));
    const todayCell = first.closest('[role="gridcell"]') as Element;
    expect(cells[cells.indexOf(todayCell) - 1]).toHaveAttribute('aria-disabled', 'true');
  });

  it('el 409 PERIOD_LOCKED sale en español con el día del cierre', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: null, canOverride: false });
    const message =
      'La fecha del abono cae en un período contable cerrado. Elige una fecha posterior al cierre o pide a administración que lo revise.';
    mockedRecord.mockRejectedValue(new ApiError(409, message, { code: 'PERIOD_LOCKED', lockedThrough: YESTERDAY }));
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(mockedLock).toHaveBeenCalled());
    await user.type(await screen.findByLabelText(/^monto$/i), '100');
    await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));
    expect(
      await screen.findByText(`${message} Cerrado hasta el ${fmt.civilDate(YESTERDAY)}, inclusive.`),
    ).toBeInTheDocument();
  });
});

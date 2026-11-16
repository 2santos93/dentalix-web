import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePaymentPlanModal } from './create-payment-plan-modal';
import { ApiError } from '@/lib/api/client';
import { createPaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { resetCurrencyRoundingDigitsCache } from '@/lib/reference/currency-rounding-digits';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { addDaysIso } from '@/lib/locations/provider-schedule';
import { periodLockCopy } from '@/components/payments/period-lock-field';

jest.mock('../../lib/payment-plans/payment-plan-api', () => ({ createPaymentPlan: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));

const mockedCreate = jest.mocked(createPaymentPlan);
const mockedLock = jest.mocked(getPeriodLock);
// La sede del fixture es Caracas; el cierre, hasta hace una semana.
const TODAY = sedeToday('America/Caracas');
const THROUGH = addDaysIso(TODAY, -7);
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

beforeEach(() => {
  mockedCreate.mockReset();
  mockedLock.mockReset().mockResolvedValue({ lockedThrough: THROUGH, canOverride: false });
  jest.mocked(listLocations).mockReset().mockResolvedValue([clinicLocation()]);
  resetCurrencyRoundingDigitsCache();
  jest
    .mocked(listCurrencies)
    .mockReset()
    .mockResolvedValue([{ code: 'VES', name: 'Bolívar', symbol: 'Bs.', minorUnits: 2, roundingDigits: 2 }] as never);
});

function renderModal() {
  const onCreated = jest.fn();
  render(
    <CreatePaymentPlanModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      plan={{ id: 'plan-1', currency: 'VES', billable: 1200 }}
      money={(amount, currency) => `${currency} ${amount}`}
      onCreated={onCreated}
    />,
  );
  return { onCreated, dialog: screen.getByRole('dialog') };
}

async function typeStartDate(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, iso: string) {
  const [y, m, d] = iso.split('-');
  const [day] = within(within(dialog).getByRole('group', { name: 'Fecha de inicio' })).getAllByRole('spinbutton');
  await user.click(day);
  await user.keyboard(`${d}${m}${y}`);
}

describe('DX-091 · cierre contable en «Crear plan de pagos»', () => {
  it('explica el cierre junto a la fecha y no deja empezar las cuotas en un día cerrado', async () => {
    const user = userEvent.setup();
    const { dialog } = renderModal();
    expect(await within(dialog).findByText(periodLockCopy.planHint(ddmmyyyy(THROUGH)))).toBeInTheDocument();
    await typeStartDate(user, dialog, THROUGH);
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText(periodLockCopy.lockedDate(ddmmyyyy(THROUGH)))).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('el ADMIN con la exención indica el motivo, que viaja a la API', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: THROUGH, canOverride: true });
    mockedCreate.mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    const { dialog, onCreated } = renderModal();
    await within(dialog).findByText(periodLockCopy.hintOverride(ddmmyyyy(THROUGH)));
    await typeStartDate(user, dialog, THROUGH);
    const reason = await within(dialog).findByLabelText(periodLockCopy.planReasonLabel);
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText(periodLockCopy.reasonMissing)).toBeInTheDocument();
    await user.type(reason, 'Plan acordado en septiembre');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][2]).toMatchObject({ lockOverrideReason: 'Plan acordado en septiembre' });
  });

  it('el 409 PERIOD_LOCKED se enseña en español, con el día del cierre', async () => {
    // El cierre no cargó (decide la API).
    mockedLock.mockRejectedValue(new Error('red'));
    const message =
      'El plan de cuotas tiene cuotas que vencen en un período contable cerrado. Empieza las cuotas después del cierre.';
    mockedCreate.mockRejectedValue(
      new ApiError(409, message, { code: 'PERIOD_LOCKED', lockedThrough: '2026-09-30' }),
    );
    const user = userEvent.setup();
    const { dialog } = renderModal();
    await waitFor(() =>
      expect(dialog.querySelector<HTMLInputElement>('input[name="pp-start"]')?.value).toMatch(/^\d{4}-/),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText(`${message} Cerrado hasta el 30/09/2026, inclusive.`)).toBeInTheDocument();
  });
});

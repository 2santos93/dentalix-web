import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanPaymentFormModal } from './plan-payment-form-modal';
import { recordPayment, type PlanBalance } from '@/lib/payments/payments-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { SEDE_TIME_ZONE_ERROR, type SedeZoneState } from '@/lib/locations/use-sede-time-zone';
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

/** Con el calendario abierto: la última fecha elegible es hoy y el siguiente día está deshabilitado. */
function expectCalendarEndsToday() {
  const last = screen.getByRole('button', { name: /Última fecha disponible/ });
  const cells = Array.from(document.querySelectorAll('[role="grid"] [role="gridcell"]'));
  const next = cells[cells.indexOf(last.closest('[role="gridcell"]') as Element) + 1];
  expect(next).toHaveAttribute('aria-disabled', 'true');
}

const plan = { id: 'plan-1', currency: 'USD' } as unknown as TreatmentPlan;
const balance = {
  balance: 500,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
} as unknown as PlanBalance;

function modal(sedeZone: SedeZoneState) {
  return (
    <PlanPaymentFormModal
      token="tok"
      open
      onOpenChange={jest.fn()}
      plan={plan}
      planBalance={balance}
      onRetryBalance={jest.fn()}
      sedeZone={sedeZone}
      sedeFmt={null}
      locationHint={null}
      onRecorded={jest.fn()}
    />
  );
}

it('DX-075: con una fecha escrita y la zona de la sede sin estar lista, el campo lo dice y no se llama a la API', async () => {
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  const user = userEvent.setup();
  const { rerender } = render(modal({ status: 'ready', timeZone: 'America/Caracas' }));
  await user.type(await screen.findByLabelText(/^monto$/i), '25000');
  const [day] = within(screen.getByRole('group', { name: /^fecha$/i })).getAllByRole('spinbutton');
  await user.click(day);
  await user.keyboard('01102026');

  // La zona se pierde (p. ej. un reintento de sedes que falla) tras escribir la fecha.
  rerender(modal({ status: 'loading' }));
  await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));

  expect(await screen.findByText(SEDE_TIME_ZONE_ERROR)).toBeInTheDocument();
  expect(recordPayment).not.toHaveBeenCalled();
});

it('DX-075: el calendario del abono topa en hoy de la sede: el día siguiente a hoy no se puede elegir', async () => {
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  const user = userEvent.setup();
  render(modal({ status: 'ready', timeZone: 'America/Caracas' }));
  const group = await screen.findByRole('group', { name: /^fecha$/i });
  await user.click(within(group).getByRole('button'));
  expectCalendarEndsToday();
});

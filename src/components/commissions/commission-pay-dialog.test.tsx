import { render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import { payCommissionSettlement } from '@/lib/commissions/commissions-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { CommissionPayDialog, commissionPayDialogCopy as copy } from './commission-pay-dialog';
import { makePayment, makeSettlement } from './commissions-fixtures';

jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return {
    listLocations: jest.fn().mockResolvedValue([
      utcSede({ id: 'loc1', name: 'Sede Centro' }),
      utcSede({ id: 'loc2', name: 'Sede Este' }),
    ]),
  };
});
jest.mock('../../lib/locations/schedule-api', () => ({
  getLocationSchedule: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
}));
jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  payCommissionSettlement: jest.fn(),
}));

const total = () => screen.getByTestId('commission-pay-total');

function renderDialog(onPaid = jest.fn()) {
  render(
    <CommissionPayDialog token="tok" settlement={makeSettlement()} open onOpenChange={jest.fn()} onPaid={onPaid} />,
  );
  return onPaid;
}

describe('Registrar pago de la liquidación (DX-464)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    setActiveLocationId('loc2');
  });

  it('todas las líneas pendientes de la moneda marcadas, total en vivo y una sola moneda en el envío', async () => {
    const user = setupUser();
    const onPaid = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: copy.title });
    // USD: 35 − 17,5 = 17,5 (el ajuste negativo, marcado por defecto, se descuenta).
    await waitFor(() => expect(total()).toHaveTextContent('17,50'));
    const lines = within(dialog).getAllByRole('checkbox', { name: /Diente/ });
    expect(lines).toHaveLength(2);
    lines.forEach((l) => expect(l).toBeChecked());
    // La sede activa, preseleccionada.
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: copy.location })).toHaveValue('loc2'));

    // VES: otra moneda, sus líneas aparte; el total nunca suma monedas.
    await user.selectOptions(within(dialog).getByRole('combobox', { name: copy.currency }), 'VES');
    expect(within(dialog).getAllByRole('checkbox', { name: /Diente/ })).toHaveLength(1);
    expect(total()).toHaveTextContent('3.650,00');

    jest.mocked(payCommissionSettlement).mockResolvedValue(makePayment({ currency: 'VES', amount: 3650 }));
    await user.type(within(dialog).getByRole('textbox', { name: copy.reference }), 'TRF-0042');
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(payCommissionSettlement).toHaveBeenCalledWith(
      'tok',
      's1',
      expect.objectContaining({
        currency: 'VES',
        lineIds: ['line-1'],
        method: 'TRANSFER',
        reference: 'TRF-0042',
        locationId: 'loc2',
        fromCashSession: false,
        paidOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('dejar fuera el ajuste negativo supera lo pendiente: lo dice y no envía', async () => {
    const user = setupUser();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: copy.title });
    await waitFor(() => expect(total()).toHaveTextContent('17,50'));
    await user.click(within(dialog).getByRole('checkbox', { name: /Ajuste: Corona/ }));
    expect(total()).toHaveTextContent('35,00');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: copy.submit })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText(/no puede superar lo pendiente/)).toBeInTheDocument();
    expect(payCommissionSettlement).not.toHaveBeenCalled();
  });

  it('solo el ajuste negativo: el total no es positivo', async () => {
    const user = setupUser();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: copy.title });
    await waitFor(() => expect(total()).toHaveTextContent('17,50'));
    await user.click(within(dialog).getByRole('checkbox', { name: /Endodoncia/ }));
    expect(total()).toHaveTextContent('-17,50');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: copy.submit })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText(copy.notPositive)).toBeInTheDocument();
  });

  it('«Sale de mi caja» solo con efectivo, y el error de la API se ve tal cual', async () => {
    const user = setupUser();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: copy.title });
    expect(within(dialog).queryByRole('checkbox', { name: new RegExp(copy.fromCash) })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole('combobox', { name: copy.method }), 'CASH');
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(copy.fromCash) }));
    jest
      .mocked(payCommissionSettlement)
      .mockRejectedValue(
        new ApiError(409, 'El día del pago cae en un período contable cerrado (hasta el 31/10/2026).', { code: 'PERIOD_LOCKED' }),
      );
    await waitFor(() => expect(within(dialog).getByRole('button', { name: copy.submit })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText(/período contable cerrado/)).toBeInTheDocument();
    expect(payCommissionSettlement).toHaveBeenCalledWith(
      'tok',
      's1',
      expect.objectContaining({ method: 'CASH', fromCashSession: true }),
    );
  });
});

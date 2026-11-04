import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashAdjustmentModal } from './cash-adjustment-modal';
import { addCashAdjustment, type CashAdjustment } from '@/lib/cash-sessions/cash-sessions-api';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import { STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  addCashAdjustment: jest.fn(),
}));
const mockedAdd = addCashAdjustment as jest.MockedFunction<typeof addCashAdjustment>;
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'VES', name: 'Bolívar venezolano', symbol: 'VES' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

const adjustment: CashAdjustment = {
  id: 'adj-1',
  kind: 'CORRECTION',
  currency: 'VES',
  method: 'CASH',
  amount: 5_000,
  reason: 'Abono sin registrar',
  createdAt: '2026-10-17T15:00:00.000Z',
  createdBy: { id: 'u-admin', fullName: 'Admin' },
  sessionId: 'cs-2',
  sessionStatus: 'OPEN',
  amountHidden: false,
  payment: null,
  expensePayment: null,
  originalSession: null,
};

function renderModal(locationId = 'sede-caracas') {
  const onCreated = jest.fn();
  render(
    <CashAdjustmentModal
      open
      onOpenChange={() => undefined}
      token="tok"
      sessionId="cs-1"
      locationId={locationId}
      defaultCurrency="VES"
      onCreated={onCreated}
    />,
  );
  return { onCreated };
}

const submit = () => screen.getByRole('button', { name: 'Registrar ajuste' });

describe('CashAdjustmentModal (DX-027, DX-252)', () => {
  beforeEach(() => {
    mockedAdd.mockReset();
    jest.mocked(listLocations).mockResolvedValue([STAMP_SEDES.caracas, STAMP_SEDES.berlin, STAMP_SEDES.miami]);
  });

  it('la vista previa del importe usa el formato de la sede de LA CAJA (DX-354b): Caracas, Berlín y Miami', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      for (const [id, expected] of [
        ['sede-caracas', 'VES 1.234,50'],
        ['sede-berlin', '1.234,50 VES'],
        ['sede-miami', 'VES 1,234.50'],
      ] as const) {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderModal(id);
        await user.type(screen.getByLabelText('Importe'), '1234,5');
        await waitFor(() => expect(document.body.textContent?.replace(/\s/g, ' ')).toContain(`Se guardará: ${expected}`), { timeout: 3000 });
        cleanup();
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('exige un importe mayor que 0 y el motivo antes de llamar a la API', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(submit());
    expect(screen.getByText('Escribe un importe mayor que 0.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Importe'), '5000');
    await user.click(submit());
    expect(screen.queryByText('Escribe un importe mayor que 0.')).not.toBeInTheDocument();
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Motivo'), '  x  ');
    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('una suma en efectivo va con signo positivo y el motivo recortado; la resta, negativa por defecto', async () => {
    const user = userEvent.setup();
    mockedAdd.mockResolvedValue(adjustment);
    const { onCreated } = renderModal();
    expect(screen.getByLabelText('Tipo de ajuste')).toHaveValue('-1');
    await user.selectOptions(screen.getByLabelText('Tipo de ajuste'), '1');
    await user.type(screen.getByLabelText('Importe'), '5000');
    await user.type(screen.getByLabelText('Motivo'), '  Abono sin registrar ');
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(adjustment));
    expect(mockedAdd).toHaveBeenCalledWith('tok', 'cs-1', {
      currency: 'VES',
      method: 'CASH',
      amount: 5_000,
      reason: 'Abono sin registrar',
    });
  });

  it('mientras envía, el botón y los campos quedan deshabilitados (sin doble envío)', async () => {
    const user = userEvent.setup();
    let resolve: (a: CashAdjustment) => void = () => undefined;
    mockedAdd.mockReturnValue(new Promise((r) => (resolve = r)));
    renderModal();
    await user.type(screen.getByLabelText('Importe'), '2000');
    await user.type(screen.getByLabelText('Motivo'), 'Billete falso');
    await user.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Motivo')).toBeDisabled();
    expect(screen.getByLabelText('Importe')).toBeDisabled();
    expect(screen.getByLabelText('Tipo de ajuste')).toBeDisabled();
    await user.click(submit());
    expect(mockedAdd).toHaveBeenCalledTimes(1);
    expect(mockedAdd.mock.calls[0][2]).toMatchObject({ amount: -2_000 });
    resolve(adjustment);
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it('el error de la API sale en español: el de negocio tal cual y el técnico en inglés traducido', async () => {
    const user = userEvent.setup();
    mockedAdd.mockRejectedValueOnce(new ApiError(409, 'Solo se corrige un cierre de una caja cerrada.'));
    renderModal();
    await user.type(screen.getByLabelText('Importe'), '1000');
    await user.type(screen.getByLabelText('Motivo'), 'Sobró cambio');
    await user.click(submit());
    expect(await screen.findByText('Solo se corrige un cierre de una caja cerrada.')).toBeInTheDocument();

    mockedAdd.mockRejectedValueOnce(new ApiError(404, 'Cash session not found'));
    await user.click(submit());
    expect(await screen.findByText('No encontramos lo que buscas: puede que se haya eliminado.')).toBeInTheDocument();
    expect(screen.queryByText(/not found/)).not.toBeInTheDocument();

    mockedAdd.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    await user.click(submit());
    expect(await screen.findByText('No pudimos registrar el ajuste. Intenta de nuevo.')).toBeInTheDocument();
    expect(screen.queryByText(/Internal/)).not.toBeInTheDocument();
  });
});

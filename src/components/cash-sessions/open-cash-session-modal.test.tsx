import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenCashSessionModal } from './open-cash-session-modal';
import { openCashSession, type CashSessionDetail } from '@/lib/cash-sessions/cash-sessions-api';
import { ApiError } from '@/lib/api/client';
import { cashSessionFixture } from '@/lib/test/cash-session';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  openCashSession: jest.fn(),
}));
const mockedOpen = openCashSession as jest.MockedFunction<typeof openCashSession>;
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

function renderModal() {
  const onOpened = jest.fn();
  render(
    <OpenCashSessionModal
      open
      onOpenChange={() => undefined}
      token="tok"
      sedeName="Sede principal"
      defaultCurrency="COP"
      onOpened={onOpened}
    />,
  );
  return { onOpened };
}

const submit = () => screen.getByRole('button', { name: 'Abrir caja' });

describe('OpenCashSessionModal (DX-027, DX-252)', () => {
  beforeEach(() => mockedOpen.mockReset());

  it('sin fondo abre con 0 y sin notas; las notas van recortadas', async () => {
    const user = userEvent.setup();
    mockedOpen.mockResolvedValue(cashSessionFixture());
    const { onOpened } = renderModal();
    expect(screen.getByText(/Tu caja en Sede principal/)).toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(onOpened).toHaveBeenCalled());
    expect(mockedOpen).toHaveBeenLastCalledWith('tok', { floats: [{ currency: 'COP', amount: 0 }], notes: undefined });

    await user.type(screen.getByLabelText('Importe del fondo 1'), '100000');
    await user.type(screen.getByLabelText('Notas (opcional)'), '  Turno de mañana ');
    await user.click(submit());
    await waitFor(() =>
      expect(mockedOpen).toHaveBeenLastCalledWith('tok', {
        floats: [{ currency: 'COP', amount: 100_000 }],
        notes: 'Turno de mañana',
      }),
    );
  });

  it('un fondo que no se entiende o una moneda repetida no se envían y lo dice en español', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText('Importe del fondo 1'), '12,5,3');
    await user.click(submit());
    expect(
      screen.getByText('Hay fondos que no se entienden: revisa los marcados (0 si empiezas sin fondo).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Importe del fondo 1')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByLabelText('Importe del fondo 1'));
    await user.type(screen.getByLabelText('Importe del fondo 1'), '1000');
    await user.click(screen.getByRole('button', { name: 'Añadir otra moneda' }));
    await user.click(submit());
    expect(screen.getByText('Cada moneda va una sola vez.')).toBeInTheDocument();
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('mientras envía, el botón y los campos quedan deshabilitados (sin doble envío)', async () => {
    const user = userEvent.setup();
    let resolve: (s: CashSessionDetail) => void = () => undefined;
    mockedOpen.mockReturnValue(new Promise((r) => (resolve = r)));
    renderModal();
    await user.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Importe del fondo 1')).toBeDisabled();
    expect(screen.getByLabelText('Notas (opcional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Añadir otra moneda' })).toBeDisabled();
    await user.click(submit());
    expect(mockedOpen).toHaveBeenCalledTimes(1);
    resolve(cashSessionFixture());
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it('el error de la API sale en español: el de negocio tal cual y el técnico en inglés traducido', async () => {
    const user = userEvent.setup();
    mockedOpen.mockRejectedValueOnce(new ApiError(409, 'Ya tienes una caja abierta en esta sede.'));
    renderModal();
    await user.click(submit());
    expect(await screen.findByText('Ya tienes una caja abierta en esta sede.')).toBeInTheDocument();

    mockedOpen.mockRejectedValueOnce(new ApiError(400, 'floats.0.amount must not be less than 0', { messages: ['floats.0.amount must not be less than 0'] }));
    await user.click(submit());
    expect(await screen.findByText('Revisa los datos: hay campos con valores no válidos.')).toBeInTheDocument();
    expect(screen.queryByText(/must not/)).not.toBeInTheDocument();

    mockedOpen.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    await user.click(submit());
    expect(await screen.findByText('No pudimos abrir la caja. Intenta de nuevo.')).toBeInTheDocument();
    expect(screen.queryByText(/Internal/)).not.toBeInTheDocument();
  });
});

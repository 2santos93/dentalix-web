import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloseCashSessionModal } from './close-cash-session-modal';
import { closeCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { ApiError } from '@/lib/api/client';
import { cashSessionFixture, closedCashSessionFixture } from '@/lib/test/cash-session';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  closeCashSession: jest.fn(),
}));
const mockedClose = closeCashSession as jest.MockedFunction<typeof closeCashSession>;

function renderModal(session = cashSessionFixture(), onClosed = jest.fn()) {
  render(
    <CloseCashSessionModal
      open
      onOpenChange={() => undefined}
      token="tok"
      session={session}
      defaultCurrency="COP"
      onClosed={onClosed}
    />,
  );
  return { onClosed };
}

describe('CloseCashSessionModal (DX-027)', () => {
  beforeEach(() => mockedClose.mockReset());

  it('enseña lo esperado y la diferencia en vivo; si no cuadra, exige motivo antes de enviar', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText(/Esperado 80\.?000,00/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '79000');
    await user.type(screen.getByLabelText('Contado en tarjeta (COP)'), '25000');
    expect(screen.getAllByTestId('row-difference')[0]).toHaveTextContent(/-1\.?000,00/);
    expect(screen.getAllByTestId('row-difference')[1]).toHaveTextContent('Cuadra');

    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/explica el motivo/);
    expect(mockedClose).not.toHaveBeenCalled();

    mockedClose.mockResolvedValue(closedCashSessionFixture());
    await user.type(screen.getByLabelText('Motivo de la diferencia'), 'Faltó cambio');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() =>
      expect(mockedClose).toHaveBeenCalledWith('tok', 'cs-1', {
        counts: [
          { currency: 'COP', method: 'CASH', counted: 79_000 },
          { currency: 'COP', method: 'CARD', counted: 25_000 },
        ],
        differenceReason: 'Faltó cambio',
        notes: undefined,
      }),
    );
  });

  it('cuadrado: cierra sin pedir motivo', async () => {
    const user = userEvent.setup();
    mockedClose.mockResolvedValue(closedCashSessionFixture());
    const { onClosed } = renderModal();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '80000');
    await user.type(screen.getByLabelText('Contado en tarjeta (COP)'), '25000');
    expect(screen.queryByLabelText('Motivo de la diferencia')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
  });

  it('arqueo ciego: filas en blanco sin esperado; el 400 de la API pide el motivo', async () => {
    const user = userEvent.setup();
    mockedClose.mockRejectedValue(
      new ApiError(400, 'El arqueo no cuadra: explica el motivo de la diferencia antes de cerrar.'),
    );
    renderModal(cashSessionFixture({ blindHidden: true, expected: null, payments: null }));
    expect(screen.queryByText(/Esperado/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-difference')).not.toBeInTheDocument();
    // Cuatro métodos de la moneda del fondo.
    expect(screen.getByLabelText('Contado en transferencia (COP)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '70000');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByText(/El arqueo no cuadra/)).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo, si el arqueo no cuadra')).toBeInTheDocument();
  });

  it('un importe que no se entiende no sale hacia la API', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '12,345');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/no se entienden/);
    expect(mockedClose).not.toHaveBeenCalled();
  });
});

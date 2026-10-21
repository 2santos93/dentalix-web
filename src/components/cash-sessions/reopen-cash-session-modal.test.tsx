import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReopenCashSessionModal } from './reopen-cash-session-modal';
import { reopenCashSession, type CashSessionDetail } from '@/lib/cash-sessions/cash-sessions-api';
import { ApiError } from '@/lib/api/client';
import { cashSessionFixture } from '@/lib/test/cash-session';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  reopenCashSession: jest.fn(),
}));
const mockedReopen = reopenCashSession as jest.MockedFunction<typeof reopenCashSession>;

function renderModal() {
  const onReopened = jest.fn();
  render(
    <ReopenCashSessionModal open onOpenChange={() => undefined} token="tok" sessionId="cs-1" onReopened={onReopened} />,
  );
  return { onReopened };
}

const reason = () => screen.getByLabelText('Motivo de la reapertura');
const submit = () => screen.getByRole('button', { name: 'Reabrir caja' });

describe('ReopenCashSessionModal (DX-027, DX-252)', () => {
  beforeEach(() => mockedReopen.mockReset());

  it('el motivo es obligatorio: sin él (o con espacios) no llama a la API y lo dice junto al campo', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Entre 3 y 300 caracteres.')).toBeInTheDocument();

    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(reason()).toHaveAttribute('aria-invalid', 'true');

    await user.type(reason(), '  a ');
    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(mockedReopen).not.toHaveBeenCalled();

    // Al volver a escribir el aviso se va.
    await user.type(reason(), 'b');
    expect(screen.queryByText('Escribe el motivo (al menos 3 caracteres).')).not.toBeInTheDocument();
  });

  it('envía el motivo recortado y devuelve la caja reabierta', async () => {
    const user = userEvent.setup();
    const reopened = cashSessionFixture({ reopenCount: 1 });
    mockedReopen.mockResolvedValue(reopened);
    const { onReopened } = renderModal();
    await user.type(reason(), '  Faltó un abono en efectivo  ');
    await user.click(submit());
    await waitFor(() => expect(onReopened).toHaveBeenCalledWith(reopened));
    expect(mockedReopen).toHaveBeenCalledWith('tok', 'cs-1', 'Faltó un abono en efectivo');
  });

  it('mientras envía, el botón y el campo quedan deshabilitados (sin doble envío)', async () => {
    const user = userEvent.setup();
    let resolve: (s: CashSessionDetail) => void = () => undefined;
    mockedReopen.mockReturnValue(new Promise((r) => (resolve = r)));
    renderModal();
    await user.type(reason(), 'Cobro sin registrar');
    await user.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAttribute('aria-busy', 'true');
    expect(reason()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await user.click(submit());
    expect(mockedReopen).toHaveBeenCalledTimes(1);
    resolve(cashSessionFixture());
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it('el error de la API sale en español: el de negocio tal cual y el técnico en inglés traducido', async () => {
    const user = userEvent.setup();
    mockedReopen.mockRejectedValueOnce(new ApiError(409, 'Esta caja ya está abierta: recarga el turno.'));
    renderModal();
    await user.type(reason(), 'Faltó un abono');
    await user.click(submit());
    expect(await screen.findByText('Esta caja ya está abierta: recarga el turno.')).toBeInTheDocument();

    mockedReopen.mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    await user.click(submit());
    expect(
      await screen.findByText('No tienes permiso para hacer esto. Si lo necesitas, pide acceso a un administrador.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Forbidden/)).not.toBeInTheDocument();

    mockedReopen.mockRejectedValueOnce(new TypeError('Failed to parse'));
    await user.click(submit());
    expect(await screen.findByText('No pudimos reabrir la caja. Intenta de nuevo.')).toBeInTheDocument();
  });
});

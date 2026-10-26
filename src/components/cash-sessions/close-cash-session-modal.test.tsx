import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloseCashSessionModal } from './close-cash-session-modal';
import { closeCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { ApiError } from '@/lib/api/client';
import { cashSessionFixture, closedCashSessionFixture, outflowFixture } from '@/lib/test/cash-session';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  closeCashSession: jest.fn(),
}));
const mockedClose = closeCashSession as jest.MockedFunction<typeof closeCashSession>;
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

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

  it('si la API dice que no cuadra (entró un abono después de abrir el modal), deja escribir el motivo y reenviar', async () => {
    const user = userEvent.setup();
    mockedClose.mockRejectedValueOnce(
      new ApiError(400, 'El arqueo no cuadra: explica el motivo de la diferencia antes de cerrar.'),
    );
    renderModal();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '80000');
    await user.type(screen.getByLabelText('Contado en tarjeta (COP)'), '25000');
    expect(screen.queryByLabelText('Motivo de la diferencia')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByText(/El arqueo no cuadra/)).toBeInTheDocument();

    mockedClose.mockResolvedValue(closedCashSessionFixture());
    await user.type(screen.getByLabelText('Motivo de la diferencia'), 'Entró un abono al final');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() =>
      expect(mockedClose).toHaveBeenLastCalledWith(
        'tok',
        'cs-1',
        expect.objectContaining({ differenceReason: 'Entró un abono al final' }),
      ),
    );
  });

  it('arqueo ciego: también cuenta las monedas de los ajustes y deja añadir otra moneda cobrada', async () => {
    const user = userEvent.setup();
    mockedClose.mockResolvedValue(closedCashSessionFixture());
    renderModal(
      cashSessionFixture({
        blindHidden: true,
        expected: null,
        payments: null,
        adjustments: [
          {
            id: 'adj-1',
            kind: 'CORRECTION',
            currency: 'EUR',
            method: 'CASH',
            amount: -5,
            reason: 'Billete falso',
            createdAt: '2026-10-17T15:00:00.000Z',
            createdBy: { id: 'u-admin', fullName: 'Admin' },
            sessionId: 'cs-1',
            payment: null,
            expensePayment: null,
            originalSession: null,
          },
        ],
      }),
    );
    expect(screen.getByLabelText('Contado en efectivo (EUR)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contado en efectivo (USD)')).not.toBeInTheDocument();

    await screen.findByRole('option', { name: /Dólar/ });
    await user.selectOptions(screen.getByLabelText('Otra moneda para contar'), 'USD');
    await user.click(screen.getByRole('button', { name: 'Contar esta moneda' }));
    await user.type(screen.getByLabelText('Contado en efectivo (USD)'), '30');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() =>
      expect(mockedClose).toHaveBeenCalledWith(
        'tok',
        'cs-1',
        expect.objectContaining({ counts: [{ currency: 'USD', method: 'CASH', counted: 30 }] }),
      ),
    );
  });

  it('DX-274: arqueo ciego con salidas de caja: cuenta su moneda sin enseñar lo esperado', () => {
    renderModal(
      cashSessionFixture({
        blindHidden: true,
        expected: null,
        payments: null,
        outflows: [outflowFixture({ currency: 'USD', amount: 12 })],
      }),
    );
    expect(screen.getByLabelText('Contado en efectivo (USD)')).toBeInTheDocument();
    expect(screen.queryByText(/Esperado/)).not.toBeInTheDocument();
  });

  it('DX-274: un esperado negativo se enseña con su signo y la diferencia sale de él', async () => {
    const user = userEvent.setup();
    const [cash] = cashSessionFixture().expected!;
    renderModal(
      cashSessionFixture({ expected: [{ ...cash, outflows: 100_000, outflowsCount: 1, expected: -20_000 }] }),
    );
    expect(screen.getByText(/Esperado -20\.?000,00/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '0');
    expect(screen.getByTestId('row-difference')).toHaveTextContent(/20\.?000,00/);
    expect(screen.getByTestId('row-difference')).not.toHaveTextContent('-');
  });

  it('un importe que no se entiende no sale hacia la API', async () => {
    const user = userEvent.setup();
    renderModal();
    // DX-241: «12,345» ya no es un error (son 12.345); lo ambiguo sí.
    const input = screen.getByLabelText('Contado en efectivo (COP)');
    await user.type(input, '12.34.5');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toContain('Hay importes que no se entienden: revisa los marcados.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(alerts.some((t) => t?.startsWith('No sabemos leer «12.34.5»'))).toBe(true);
    expect(mockedClose).not.toHaveBeenCalled();

    // Al volver a escribir en la fila, su marca se va.
    await user.clear(input);
    await user.type(input, '80.000');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('DX-241: lo contado en COP admite céntimos (lo esperado puede traerlos)', async () => {
    const user = userEvent.setup();
    mockedClose.mockResolvedValue(closedCashSessionFixture());
    renderModal();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '80.000,50');
    await user.type(screen.getByLabelText('Contado en tarjeta (COP)'), '25.000');
    const reason = screen.queryByLabelText('Motivo de la diferencia');
    if (reason) await user.type(reason, 'Céntimos del cambio');
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() =>
      expect(mockedClose).toHaveBeenCalledWith(
        'tok',
        'cs-1',
        expect.objectContaining({
          counts: [
            { currency: 'COP', method: 'CASH', counted: 80_000.5 },
            { currency: 'COP', method: 'CARD', counted: 25_000 },
          ],
        }),
      ),
    );
  });

  it('DX-241: «80.000» en COP es ochenta mil, como en un abono', async () => {
    const user = userEvent.setup();
    mockedClose.mockResolvedValue(closedCashSessionFixture());
    renderModal();
    await user.type(screen.getByLabelText('Contado en efectivo (COP)'), '80.000');
    await user.type(screen.getByLabelText('Contado en tarjeta (COP)'), '25.000');
    expect(screen.queryByLabelText('Motivo de la diferencia')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() =>
      expect(mockedClose).toHaveBeenCalledWith('tok', 'cs-1', {
        counts: [
          { currency: 'COP', method: 'CASH', counted: 80_000 },
          { currency: 'COP', method: 'CARD', counted: 25_000 },
        ],
        differenceReason: undefined,
        notes: undefined,
      }),
    );
  });
});

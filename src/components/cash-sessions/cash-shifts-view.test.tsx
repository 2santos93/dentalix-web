import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashShiftsView } from './cash-shifts-view';
import { ApiError } from '@/lib/api/client';
import {
  getCurrentCashSession,
  listCashSessions,
  openCashSession,
  type CashSessionPage,
} from '@/lib/cash-sessions/cash-sessions-api';
import { listLocations } from '@/lib/locations/locations-api';
import { createCashOutflow } from '@/lib/expenses/expenses-api';
import { listExpenseCategories } from '@/lib/expenses/expense-categories-api';
import { cashSessionFixture, closedCashSessionFixture, outflowFixture } from '@/lib/test/cash-session';
import { expenseDetailFixture } from '@/lib/test/expenses';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  getCurrentCashSession: jest.fn(),
  listCashSessions: jest.fn(),
  openCashSession: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  createCashOutflow: jest.fn(),
  suggestExpenseSuppliers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/expenses/expense-categories-api', () => ({ listExpenseCategories: jest.fn() }));
// La moneda del fondo sale del catálogo; aquí basta una.
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'COP', name: 'Peso colombiano', symbol: '$' }]),
}));

const mockedCurrent = getCurrentCashSession as jest.MockedFunction<typeof getCurrentCashSession>;
const mockedList = listCashSessions as jest.MockedFunction<typeof listCashSessions>;
const mockedOpen = openCashSession as jest.MockedFunction<typeof openCashSession>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedOutflow = createCashOutflow as jest.MockedFunction<typeof createCashOutflow>;
const mockedCategories = listExpenseCategories as jest.MockedFunction<typeof listExpenseCategories>;
const outflow = outflowFixture();

const settings = { requireOpenSession: false, blindClose: false };
const page = (items: CashSessionPage['items']): CashSessionPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

// Token con rol RECEPTION (la vista solo lo lee para el rótulo del alcance).
const token = `x.${btoa(JSON.stringify({ role: 'RECEPTION', sub: 'u-recep' }))}.y`;

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocations.mockResolvedValue([
    {
      id: 'loc-1',
      name: 'Sede principal',
      address: null,
      country: 'CO',
      isActive: true,
      timeZone: 'America/Bogota',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
});

describe('CashShiftsView (DX-027)', () => {
  it('sin caja abierta: lo dice, avisa de «exigir caja» y abre con el fondo', async () => {
    const user = userEvent.setup();
    mockedCurrent.mockResolvedValue({
      locationId: 'loc-1',
      settings: { ...settings, requireOpenSession: true },
      session: null,
    });
    mockedList.mockResolvedValue(page([]));
    mockedOpen.mockResolvedValue(cashSessionFixture());
    render(<CashShiftsView token={token} />);

    expect(await screen.findByText('No tienes la caja abierta en esta sede.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mi caja en Sede principal' })).toBeInTheDocument();
    expect(screen.getByText(/exige caja abierta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salida de caja' })).not.toBeInTheDocument();
    expect(await screen.findByText('Aún no hay turnos de caja.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir caja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abrir caja' });
    await user.type(within(dialog).getByLabelText('Importe del fondo 1'), '50000');
    await user.click(within(dialog).getByRole('button', { name: 'Abrir caja' }));
    await waitFor(() =>
      expect(mockedOpen).toHaveBeenCalledWith(token, {
        floats: [{ currency: 'COP', amount: 50_000 }],
        notes: undefined,
      }),
    );
    expect(await screen.findByText('Caja abierta.')).toBeInTheDocument();
    expect(mockedCurrent).toHaveBeenCalledTimes(2);
  });

  it('con caja abierta: fondo, esperado y «Cerrar caja»; la lista con su estado y diferencia', async () => {
    mockedCurrent.mockResolvedValue({ locationId: 'loc-1', settings, session: cashSessionFixture() });
    mockedList.mockResolvedValue(page([cashSessionFixture(), closedCashSessionFixture({ id: 'cs-0' })]));
    render(<CashShiftsView token={token} />);

    expect(await screen.findByRole('button', { name: 'Cerrar caja' })).toBeInTheDocument();
    expect(screen.getByText('Esperado hasta ahora')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Turnos de caja' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Abierta')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Cerrada')).toBeInTheDocument();
    expect(within(rows[2]).getByText(/-1\.?000,00/)).toBeInTheDocument();
    expect(within(rows[2]).getByRole('link', { name: /Informe de cierre/ })).toHaveAttribute(
      'href',
      '/print/cash-sessions/cs-0',
    );
    expect(screen.getByText('Ves tus turnos.')).toBeInTheDocument();
  });

  it('arqueo ciego: no enseña lo esperado', async () => {
    mockedCurrent.mockResolvedValue({
      locationId: 'loc-1',
      settings: { ...settings, blindClose: true },
      session: cashSessionFixture({ blindHidden: true, expected: null, payments: null }),
    });
    mockedList.mockResolvedValue(page([]));
    render(<CashShiftsView token={token} />);
    expect(await screen.findByText(/Arqueo ciego/)).toBeInTheDocument();
    expect(screen.queryByText('Esperado hasta ahora')).not.toBeInTheDocument();
  });

  it('DX-274: «Salida de caja» abre el modal con la sede de la caja; al registrarla se recarga el turno', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockedCurrent
      .mockResolvedValueOnce({ locationId: 'loc-1', settings, session: cashSessionFixture() })
      .mockResolvedValue({
        locationId: 'loc-1',
        settings,
        session: cashSessionFixture({ outflows: [outflow] }),
      });
    mockedList.mockResolvedValue(page([]));
    mockedCategories.mockResolvedValue([{ id: null, name: 'Mensajería', predefined: true }]);
    mockedOutflow.mockResolvedValue(expenseDetailFixture());
    render(<CashShiftsView token={token} />);

    expect(await screen.findByText('Salidas del turno: 0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salida de caja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Salida de caja' });
    await within(dialog).findByRole('option', { name: 'Mensajería' });
    await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'Mensajería');
    await user.type(within(dialog).getByLabelText('Importe'), '8000');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(mockedOutflow).toHaveBeenCalledTimes(1));
    expect(mockedOutflow.mock.calls[0][3]).toBe('loc-1');
    expect(await screen.findByText(/Salida de caja de 8\.?000,00\sCOP registrada\./)).toBeInTheDocument();
    expect(await screen.findByText('Salidas del turno: 1')).toBeInTheDocument();
  });

  it('DX-274: con arqueo ciego cuenta las salidas sin enseñar lo esperado', async () => {
    mockedCurrent.mockResolvedValue({
      locationId: 'loc-1',
      settings: { ...settings, blindClose: true },
      session: cashSessionFixture({ blindHidden: true, expected: null, payments: null, outflows: [outflow, { ...outflow, id: 'ep-2' }] }),
    });
    mockedList.mockResolvedValue(page([]));
    render(<CashShiftsView token={token} />);
    expect(await screen.findByText('Salidas del turno: 2')).toBeInTheDocument();
    expect(screen.queryByText('Esperado hasta ahora')).not.toBeInTheDocument();
    expect(screen.queryByText(/80\.?000/)).not.toBeInTheDocument();
  });

  it('DX-274: un esperado negativo (las salidas superan el efectivo) se ve en rojo', async () => {
    const [cash, card] = cashSessionFixture().expected!;
    mockedCurrent.mockResolvedValue({
      locationId: 'loc-1',
      settings,
      session: cashSessionFixture({
        expected: [{ ...cash, outflows: 100_000, outflowsCount: 1, expected: -20_000 }, card],
        outflows: [{ ...outflow, amount: 100_000 }],
      }),
    });
    mockedList.mockResolvedValue(page([]));
    render(<CashShiftsView token={token} />);
    expect(await screen.findByText(/-20\.?000,00/)).toHaveClass('text-danger');
  });

  it('si la lista falla, la caja actual sigue a mano y la lista se reintenta', async () => {
    const user = userEvent.setup();
    mockedCurrent.mockResolvedValue({ locationId: 'loc-1', settings, session: null });
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(page([]));
    render(<CashShiftsView token={token} />);
    expect(await screen.findByText('No pudimos cargar los turnos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir caja' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay turnos de caja.')).toBeInTheDocument();
  });

  it('un rol sin acceso ve el aviso, sin reintento', async () => {
    mockedCurrent.mockRejectedValue(new ApiError(403, 'Tu rol no tiene acceso a la caja'));
    mockedList.mockRejectedValue(new ApiError(403, 'Tu rol no tiene acceso a la caja'));
    render(<CashShiftsView token={token} />);
    expect(await screen.findByText('Tu rol no tiene acceso a la caja.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salida de caja' })).not.toBeInTheDocument();
  });
});

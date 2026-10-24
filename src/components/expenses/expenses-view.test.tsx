import { render, screen, waitFor, within } from '@testing-library/react';
import { ExpensesView } from './expenses-view';
import { ApiError } from '@/lib/api/client';
import { getTokenRole } from '@/lib/auth/token-role';
import { downloadExpensesCsv, listExpenses, type ExpensePage } from '@/lib/expenses/expenses-api';
import { listExpenseCategories } from '@/lib/expenses/expense-categories-api';
import { saveCsv } from '@/lib/files/save-csv';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { notifyError } from '@/components/errors/notify';
import { expenseFixture, expenseLocations } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  listExpenses: jest.fn(),
  downloadExpensesCsv: jest.fn(),
  suggestExpenseSuppliers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/expenses/expense-categories-api', () => ({
  listExpenseCategories: jest.fn(),
}));
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/location-store', () => ({
  ...jest.requireActual('../../lib/locations/location-store'),
  getActiveLocationId: jest.fn(),
}));
jest.mock('../../lib/locations/session-locations', () => ({
  useSessionLocations: () => mockRequestLocations,
}));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  useSedeTimeZone: () => 'America/Bogota',
  sedeToday: () => '2026-10-24',
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'COP', name: 'Peso colombiano', symbol: '$' }]),
}));

const mockRequestLocations = jest.fn();
const mockedList = listExpenses as jest.MockedFunction<typeof listExpenses>;
const mockedCsv = downloadExpensesCsv as jest.MockedFunction<typeof downloadExpensesCsv>;
const mockedCategories = listExpenseCategories as jest.MockedFunction<typeof listExpenseCategories>;
const mockedRole = getTokenRole as jest.MockedFunction<typeof getTokenRole>;
const mockedActive = getActiveLocationId as jest.MockedFunction<typeof getActiveLocationId>;

function page(items = [expenseFixture()], overrides: Partial<ExpensePage> = {}): ExpensePage {
  return { items, total: items.length, page: 1, pageSize: 20, ...overrides };
}

function lastQuery() {
  return mockedList.mock.calls[mockedList.mock.calls.length - 1][1];
}

describe('ExpensesView (DX-274)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue(page());
    mockedCsv.mockReset().mockResolvedValue('csv');
    mockedCategories.mockReset().mockResolvedValue([
      { id: null, name: 'Laboratorio', predefined: true },
      { id: 'cat-1', name: 'Seguros', predefined: false },
    ]);
    mockedRole.mockReturnValue('ADMIN');
    mockedActive.mockReturnValue(null);
    mockRequestLocations.mockReset().mockResolvedValue(expenseLocations);
    jest.mocked(saveCsv).mockReset();
    jest.mocked(notifyError).mockReset();
  });

  it('carga el mes en curso hasta hoy y pinta la fila con su estado y el recuento', async () => {
    mockedList.mockResolvedValue(
      page([expenseFixture({ status: 'PARTIAL', overdue: true, paidAmount: 50_000, pendingAmount: 100_000 })]),
    );
    render(<ExpensesView token="tok" />);
    const row = await screen.findByTestId('expense-row');
    expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-24', page: 1 });
    expect(within(row).getByText('20/10/2026')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Ver el gasto de Laboratorio del 20/10/2026' })).toBeInTheDocument();
    expect(within(row).getByText('Lab Dental SAS')).toBeInTheDocument();
    expect(await within(row).findByText('Sede principal')).toBeInTheDocument();
    expect(within(row).getByText('Parcial')).toBeInTheDocument();
    expect(within(row).getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('1 gasto')).toHaveAttribute('aria-live', 'polite');
  });

  it('los filtros viajan a la API y vuelven a la página 1', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await screen.findByTestId('expense-row');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sede' }), 'loc-2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'OPEN');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Categoría' }), 'Seguros');
    await user.click(screen.getByRole('checkbox', { name: 'Vencidos' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por proveedor o descripción' }), 'lab');
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        from: '2026-10-01',
        to: '2026-10-24',
        locationId: 'loc-2',
        category: 'Seguros',
        status: 'OPEN',
        overdue: true,
        query: 'lab',
        page: 1,
      }),
    );
  });

  it('con una sede activa no ofrece el filtro de sede y lo dice en la cabecera', async () => {
    mockedActive.mockReturnValue('loc-2');
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('Gastos de Sede norte')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument();
  });

  it('exporta el CSV con BOM y el nombre del periodo; si falla, toast con reintento', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await screen.findByTestId('expense-row');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(saveCsv).toHaveBeenCalledWith('csv', 'gastos-2026-10-01-2026-10-24.csv', { bom: true }));
    expect(mockedCsv).toHaveBeenCalledWith('tok', { from: '2026-10-01', to: '2026-10-24' });
    expect(await screen.findByText('Gastos exportados.')).toBeInTheDocument();

    mockedCsv.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('No pudimos exportar los gastos.', { onRetry: expect.any(Function) }),
    );
  });

  it('vacío: enseña cómo empezar', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('No hay gastos en este periodo')).toBeInTheDocument();
  });

  it('fallo de carga: escalón 1 con Reintentar', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('No pudimos cargar los gastos.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('expense-row')).toBeInTheDocument();
  });

  it('403: solo el aviso, sin filtros ni acciones', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Forbidden'));
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('Tu rol no tiene acceso a los gastos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo gasto' })).not.toBeInTheDocument();
  });

  it('«Nuevo gasto» abre el modal de alta', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await screen.findByTestId('expense-row');
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo gasto' })).toBeInTheDocument();
  });
});

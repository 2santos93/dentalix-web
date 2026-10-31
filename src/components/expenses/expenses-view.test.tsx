import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ExpensesView } from './expenses-view';
import { ApiError } from '@/lib/api/client';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  downloadExpensesCsv,
  getExpense,
  listExpenses,
  voidExpense,
  type ExpensePage,
} from '@/lib/expenses/expenses-api';
import { listExpenseCategories } from '@/lib/expenses/expense-categories-api';
import { saveCsv } from '@/lib/files/save-csv';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { notifyError } from '@/components/errors/notify';
import { expenseDetailFixture, expenseFixture, expenseLocations } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';
import { getLocationSchedule } from '@/lib/locations/schedule-api';

jest.mock('../../lib/format/date', () => ({ ...jest.requireActual('../../lib/format/date'), civilDateInZone: () => '2026-10-24' }));
jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  listExpenses: jest.fn(),
  downloadExpensesCsv: jest.fn(),
  getExpense: jest.fn(),
  voidExpense: jest.fn(),
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
jest.mock('../../lib/locations/schedule-api', () => ({ getLocationSchedule: jest.fn().mockResolvedValue({ timezone: 'Pacific/Auckland', ranges: [] }) }));
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

/** La primera fila de datos de la tabla de gastos (tras la cabecera). */
async function findRow(): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: /^Gastos del periodo/ });
  let row: HTMLElement | undefined;
  await waitFor(() => {
    row = within(table).getAllByRole('row')[1];
    expect(row).toBeDefined();
  });
  return row!;
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
    jest.mocked(getLocationSchedule).mockReset().mockResolvedValue({ timezone: 'Pacific/Auckland', ranges: [] });
    jest.mocked(saveCsv).mockReset();
    jest.mocked(notifyError).mockReset();
  });

  it('sin horario explícito ofrece recuperar configuración y no consulta fechas inferidas del país', async () => {
    jest.mocked(getLocationSchedule).mockResolvedValueOnce(null);
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText(/No pudimos obtener la zona horaria de la sede/)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('DX-378 (FE-078): la fecha y los importes con el formato de la sede (en-US), no con «es»', async () => {
    mockRequestLocations.mockResolvedValue(
      expenseLocations.map((location) => ({ ...location, locale: 'en-US', hourCycle: 'h12' as const })),
    );
    render(<ExpensesView token="tok" />);
    const row = await findRow();
    expect(await within(row).findByText('10/20/2026')).toBeInTheDocument();
    // El código de la moneda, nunca «$» (producto bimonetario).
    expect(within(row).getByText(/^COP\s150,000\.00$/)).toBeInTheDocument();
  });

  it('carga el mes en curso hasta hoy y pinta la fila con su estado y el recuento', async () => {
    mockedList.mockResolvedValue(
      page([expenseFixture({ status: 'PARTIAL', overdue: true, paidAmount: 50_000, pendingAmount: 100_000 })]),
    );
    render(<ExpensesView token="tok" />);
    const row = await findRow();
    expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-24', page: 1 });
    expect(within(row).getByText('20/10/2026')).toBeInTheDocument();
    // Toda la fila abre el detalle: el botón de la celda principal se estira sobre ella.
    expect(within(row).getByRole('button', { name: /^Laboratorio/ })).toBeInTheDocument();
    expect(within(row).getByText('Lab Dental SAS')).toBeInTheDocument();
    expect(await within(row).findByText('Sede principal')).toBeInTheDocument();
    // Un solo chip compuesto, en peligro: el vencimiento es lo urgente.
    expect(within(row).getByText('Parcial · vencido')).toHaveAttribute('data-overdue', 'true');
    expect(screen.getByText('1 gasto')).toHaveAttribute('aria-live', 'polite');
  });

  it('los filtros viajan a la API y vuelven a la página 1', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await findRow();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'OPEN');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Categoría' }), 'Seguros');
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por proveedor o descripción' }), 'lab');
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        from: '2026-10-01',
        to: '2026-10-24',
        category: 'Seguros',
        status: 'OPEN',
        query: 'lab',
        page: 1,
      }),
    );
  });

  it('«Vencidos» es una opción del estado: pide los vencidos, sin otro estado', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await findRow();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'Vencidos');
    await waitFor(() => expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-24', overdue: true, page: 1 }));
    expect(screen.queryByRole('checkbox', { name: 'Vencidos' })).not.toBeInTheDocument();
  });

  it('el periodo es un solo campo «Desde – Hasta» (sin fechas nativas)', async () => {
    const { container } = render(<ExpensesView token="tok" />);
    await findRow();
    expect(screen.getByRole('group', { name: 'Periodo de la factura' })).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it('sin selector de sede propio: la sede la decide el selector global', async () => {
    render(<ExpensesView token="tok" />);
    await findRow();
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument();
    expect(screen.getByText('Toda la clínica')).toBeInTheDocument();
  });

  it('con una sede activa lo dice en la cabecera y no repite la columna «Sede»', async () => {
    mockedActive.mockReturnValue('loc-2');
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('Gastos de Sede norte')).toBeInTheDocument();
    await findRow();
    expect(screen.queryByRole('columnheader', { name: 'Sede' })).not.toBeInTheDocument();
  });

  it('exporta el CSV con BOM y el nombre del periodo; si falla, toast con reintento', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await findRow();
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
    expect(await findRow()).toBeInTheDocument();
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
    await findRow();
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo gasto' })).toBeInTheDocument();
  });

  it('si las sedes no cargan, el alta lo dice en el campo Sede y deja reintentar', async () => {
    const user = setupUser();
    mockRequestLocations.mockRejectedValueOnce(new Error('red'));
    render(<ExpensesView token="tok" />);
    await screen.findByText(/No pudimos obtener la zona horaria de la sede/);
    expect(mockedList).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo gasto' });
    expect(within(dialog).getByText('Sedes no disponibles')).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Reintentar' })[0]);
    expect(await within(dialog).findByRole('combobox', { name: 'Sede' })).toHaveValue('loc-1');
  });

  it('si las categorías no cargan, el filtro falla en su sitio con reintento', async () => {
    mockedCategories.mockRejectedValueOnce(new Error('red'));
    render(<ExpensesView token="tok" />);
    expect(await screen.findByText('Categorías no disponibles')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Categoría' })).not.toBeInTheDocument();
  });

  it('el filtro de categoría incluye las de la página (también una retirada)', async () => {
    mockedList.mockResolvedValue(page([expenseFixture({ category: 'Categoría retirada' })]));
    render(<ExpensesView token="tok" />);
    const select = await screen.findByRole('combobox', { name: 'Categoría' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Categoría retirada' })).toBeInTheDocument());
  });

  it('un gasto de una sede inactiva dice su sede', async () => {
    mockRequestLocations.mockResolvedValue([
      ...expenseLocations,
      { ...expenseLocations[1], id: 'loc-3', name: 'Sede cerrada', isActive: false },
    ]);
    mockedList.mockResolvedValue(page([expenseFixture({ locationId: 'loc-3' })]));
    render(<ExpensesView token="tok" />);
    const row = await findRow();
    expect(await within(row).findByText('Sede cerrada')).toBeInTheDocument();
  });

  async function voidFromDetail(user: ReturnType<typeof setupUser>) {
    jest.mocked(getExpense).mockResolvedValue(expenseDetailFixture());
    jest.mocked(voidExpense).mockResolvedValue(
      expenseDetailFixture({ status: 'VOIDED', voidedAt: '2026-10-24T10:00:00.000Z', voidReason: 'Duplicado sí' }),
    );
    const trigger = within(await findRow()).getByRole('button', { name: /^Laboratorio/ });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Anular gasto' }));
    const modal = await screen.findByRole('dialog', { name: '¿Anular este gasto?' });
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), 'Duplicado sí');
    await user.click(within(modal).getByRole('button', { name: 'Anular gasto' }));
    await waitFor(() => expect(screen.getAllByText('Gasto anulado.')).toHaveLength(2));
    return trigger;
  }

  it('tras un cambio en el detalle la lista se recarga sin quitar las filas y el foco vuelve a la fila', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await findRow();
    let finish: (value: ExpensePage) => void = () => undefined;
    mockedList.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const trigger = await voidFromDetail(user);
    // Mientras recarga, la fila sigue (marcada como ocupada), no el esqueleto.
    expect(trigger).toBeInTheDocument();
    expect(trigger.closest('[aria-busy="true"]')).not.toBeNull();
    await act(async () => finish(page()));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('si la fila ya no está al cerrar el detalle, el foco va a «Nuevo gasto»', async () => {
    const user = setupUser();
    render(<ExpensesView token="tok" />);
    await findRow();
    mockedList.mockResolvedValue(page([expenseFixture({ id: 'exp-2' })]));
    await voidFromDetail(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Nuevo gasto' })));
  });
});

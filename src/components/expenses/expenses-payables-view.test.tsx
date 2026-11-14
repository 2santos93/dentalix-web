import { render, screen, waitFor, within } from '@testing-library/react';
import { ExpensesPayablesView } from './expenses-payables-view';
import { ApiError } from '@/lib/api/client';
import {
  addExpensePayment,
  downloadExpensePayablesCsv,
  getExpensePayables,
  getPayableExpenses,
  type ExpensePayables,
  type PayableSupplierRow,
} from '@/lib/expenses/expenses-api';
import { saveCsv } from '@/lib/files/save-csv';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { notifyError } from '@/components/errors/notify';
import { expenseDetailFixture, expenseFixture, expenseLocations } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';
import { getLocationSchedule } from '@/lib/locations/schedule-api';

jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  getExpensePayables: jest.fn(),
  downloadExpensePayablesCsv: jest.fn(),
  getPayableExpenses: jest.fn(),
  addExpensePayment: jest.fn(),
}));
jest.mock('../../lib/locations/schedule-api', () => ({ getLocationSchedule: jest.fn() }));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/location-store', () => ({
  ...jest.requireActual('../../lib/locations/location-store'),
  getActiveLocationId: jest.fn(),
}));
jest.mock('../../lib/session/session-store', () => ({
  useSessionLocations: () => mockRequestLocations,
}));
const mockRequestLocations = Object.assign(jest.fn(), { invalidate: jest.fn() });
const mockedPayables = jest.mocked(getExpensePayables);
const mockedCsv = jest.mocked(downloadExpensePayablesCsv);
const mockedDetail = jest.mocked(getPayableExpenses);

const amounts = {
  overdueCount: 0,
  overdue: 0,
  dueIn7DaysCount: 0,
  dueIn7Days: 0,
  dueIn30DaysCount: 0,
  dueIn30Days: 0,
  noDueDateCount: 0,
  noDueDate: 0,
};

const lab: PayableSupplierRow = {
  ...amounts,
  supplierKey: 'laboratorio dental avila',
  supplier: 'Laboratorio Dental Ávila',
  currency: 'USD',
  oldestDueDate: '2026-11-09',
  openCount: 2,
  pending: 180,
  overdueCount: 1,
  overdue: 100,
  dueIn7DaysCount: 1,
  dueIn7Days: 80,
  dueIn30DaysCount: 1,
  dueIn30Days: 80,
};
const none: PayableSupplierRow = {
  ...amounts,
  supplierKey: '',
  supplier: null,
  currency: 'VES',
  oldestDueDate: null,
  openCount: 1,
  pending: 3650,
  noDueDateCount: 1,
  noDueDate: 3650,
};

function payables(rows: PayableSupplierRow[]): ExpensePayables {
  const totals = [...new Set(rows.map((r) => r.currency))].sort().map((currency) => {
    const of = rows.filter((r) => r.currency === currency);
    const sum = (k: keyof typeof amounts | 'openCount' | 'pending') => of.reduce((s, r) => s + r[k], 0);
    return {
      currency,
      openCount: sum('openCount'),
      pending: sum('pending'),
      overdueCount: sum('overdueCount'),
      overdue: sum('overdue'),
      dueIn7DaysCount: sum('dueIn7DaysCount'),
      dueIn7Days: sum('dueIn7Days'),
      dueIn30DaysCount: sum('dueIn30DaysCount'),
      dueIn30Days: sum('dueIn30Days'),
      noDueDateCount: sum('noDueDateCount'),
      noDueDate: sum('noDueDate'),
    };
  });
  return { rows, totals };
}

describe('ExpensesPayablesView (DX-411)', () => {
  beforeEach(() => {
    mockedPayables.mockReset().mockResolvedValue(payables([lab, none]));
    mockedCsv.mockReset().mockResolvedValue('csv');
    mockedDetail.mockReset();
    jest.mocked(addExpensePayment).mockReset();
    jest.mocked(getActiveLocationId).mockReturnValue(null);
    mockRequestLocations.mockReset().mockResolvedValue(expenseLocations);
    jest.mocked(getLocationSchedule).mockReset().mockResolvedValue({ timezone: 'America/Caracas', ranges: [] });
    jest.mocked(saveCsv).mockReset();
    jest.mocked(notifyError).mockReset();
  });

  it('una fila por proveedor × moneda con pendiente, vencido y tramos; «Sin proveedor» y totales por moneda', async () => {
    render(<ExpensesPayablesView token="t" />);
    const table = await screen.findByRole('table', { name: /^Cuentas por pagar por proveedor/ });
    const [, first, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('Laboratorio Dental Ávila');
    expect(first).toHaveTextContent('2 gastos por pagar');
    expect(first).toHaveTextContent('USD');
    await waitFor(() => expect(first).toHaveTextContent(/USD\s180,00/));
    expect(first).toHaveTextContent(/USD\s100,00/);
    expect(second).toHaveTextContent('Sin proveedor');
    const totals = screen.getAllByTestId('payables-total');
    expect(totals.map((t) => t.textContent)).toEqual([
      expect.stringContaining('Total USD'),
      expect.stringContaining('Total VES'),
    ]);
    expect(mockedPayables).toHaveBeenCalledWith('t');
  });

  it('la moneda filtra en la pantalla y viaja al CSV', async () => {
    const user = setupUser();
    render(<ExpensesPayablesView token="t" />);
    await screen.findByRole('table', { name: /^Cuentas por pagar/ });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'VES');
    const table = screen.getByRole('table', { name: /^Cuentas por pagar/ });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.getAllByTestId('payables-total')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(mockedCsv).toHaveBeenCalledWith('t', { currency: 'VES' });
    expect(saveCsv).toHaveBeenCalledWith('csv', 'cuentas-por-pagar.csv', { bom: true });
    expect(await screen.findByText('Cuentas por pagar exportadas.')).toBeInTheDocument();
  });

  it('vacío: lo dice y no ofrece el CSV', async () => {
    mockedPayables.mockResolvedValue({ rows: [], totals: [] });
    render(<ExpensesPayablesView token="t" />);
    expect(await screen.findByText('No hay cuentas por pagar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
  });

  it('error de carga con «Reintentar»; 403 con el aviso de rol', async () => {
    const user = setupUser();
    mockedPayables.mockRejectedValueOnce(new Error('red'));
    const view = render(<ExpensesPayablesView token="t" />);
    expect(await screen.findByText('No pudimos cargar las cuentas por pagar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: /^Cuentas por pagar/ })).toBeInTheDocument();
    view.unmount();
    mockedPayables.mockRejectedValueOnce(new ApiError(403, 'Prohibido'));
    render(<ExpensesPayablesView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a las cuentas por pagar.')).toBeInTheDocument();
  });

  it('abrir un proveedor lista sus gastos por vencimiento y «Registrar pago» abre el modal de pago', async () => {
    const user = setupUser();
    const overdue = expenseFixture({
      id: 'exp-1',
      supplier: 'Laboratorio Dental Ávila',
      amount: 120,
      paidAmount: 20,
      pendingAmount: 100,
      status: 'PARTIAL',
      overdue: true,
      dueDate: '2026-11-09',
    });
    const soon = expenseFixture({
      id: 'exp-2',
      category: 'Insumos clínicos',
      description: null,
      amount: 80,
      pendingAmount: 80,
      dueDate: '2026-11-10',
    });
    mockedDetail.mockResolvedValue({
      supplierKey: lab.supplierKey,
      supplier: lab.supplier,
      currency: 'USD',
      items: [overdue, soon],
      total: 2,
    });
    jest.mocked(addExpensePayment).mockResolvedValue(expenseDetailFixture({ id: 'exp-1', pendingAmount: 0 }));
    render(<ExpensesPayablesView token="t" />);
    const table = await screen.findByRole('table', { name: /^Cuentas por pagar/ });
    await user.click(within(table).getByRole('button', { name: /Laboratorio Dental Ávila/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Laboratorio Dental Ávila · USD' });
    expect(mockedDetail).toHaveBeenCalledWith('t', 'laboratorio dental avila', 'USD');
    const items = await within(dialog).findAllByTestId('supplier-expense');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Laboratorio');
    expect(items[0]).toHaveTextContent('Parcial · vencido');
    expect(items[1]).toHaveTextContent('Insumos clínicos');

    await user.click(within(items[0]).getByRole('button', { name: /^Registrar pago de Laboratorio/ }));
    const payDialog = await screen.findByRole('dialog', { name: 'Registrar pago' });
    await user.click(within(payDialog).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(addExpensePayment).toHaveBeenCalled());
    expect(jest.mocked(addExpensePayment).mock.calls[0][1]).toBe('exp-1');
    expect(jest.mocked(addExpensePayment).mock.calls[0][2]).toMatchObject({ amount: 100 });
    // Tras pagar se recargan el proveedor y la lista.
    await waitFor(() => expect(mockedDetail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedPayables).toHaveBeenCalledTimes(2));
  });
});

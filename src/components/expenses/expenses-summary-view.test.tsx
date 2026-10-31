import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExpensesSummaryView } from './expenses-summary-view';
import { ApiError } from '@/lib/api/client';
import { downloadExpenseSummaryCsv, getExpenseSummary, type ExpenseSummary } from '@/lib/expenses/expenses-api';
import { saveCsv } from '@/lib/files/save-csv';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { notifyError } from '@/components/errors/notify';
import { expenseLocations } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';
import { getLocationSchedule } from '@/lib/locations/schedule-api';

jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  getExpenseSummary: jest.fn(),
  downloadExpenseSummaryCsv: jest.fn(),
}));
jest.mock('../../lib/locations/schedule-api', () => ({ getLocationSchedule: jest.fn() }));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/location-store', () => ({
  ...jest.requireActual('../../lib/locations/location-store'),
  getActiveLocationId: jest.fn(),
}));
jest.mock('../../lib/locations/session-locations', () => ({
  useSessionLocations: () => mockRequestLocations,
}));
const mockRequestLocations = jest.fn();
const mockedSummary = getExpenseSummary as jest.MockedFunction<typeof getExpenseSummary>;
const mockedCsv = downloadExpenseSummaryCsv as jest.MockedFunction<typeof downloadExpenseSummaryCsv>;

function summary(rows: ExpenseSummary['rows']): ExpenseSummary {
  return { from: '2026-05-01', to: '2026-10-31', rows };
}

const copRow: ExpenseSummary['rows'][number] = {
  month: '2026-10',
  locationId: 'loc-1',
  locationName: 'Sede principal',
  currency: 'COP',
  income: 5_000_000,
  categories: [
    { category: 'Arriendo', amount: 2_500_000 },
    { category: 'Laboratorio', amount: 1_000_000 },
  ],
  expensesTotal: 3_500_000,
  net: 1_500_000,
};

describe('ExpensesSummaryView (DX-274)', () => {
  // Reloj fijo: los rangos esperados (mayo–octubre de 2026) son los «últimos
  // seis meses» del 15-10-2026 en la sede (Auckland). Con el reloj real el test
  // caducaba en cuanto empezaba noviembre en Auckland (31-10 a las 11:00 UTC).
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-15T00:00:00Z'), advanceTimers: true });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockedSummary.mockReset().mockResolvedValue(summary([copRow]));
    mockedCsv.mockReset().mockResolvedValue('csv');
    (getActiveLocationId as jest.Mock).mockReturnValue(null);
    mockRequestLocations.mockReset().mockResolvedValue(expenseLocations);
    jest.mocked(getLocationSchedule).mockReset().mockResolvedValue({ timezone: 'Pacific/Auckland', ranges: [] });
    jest.mocked(saveCsv).mockReset();
    jest.mocked(notifyError).mockReset();
  });

  it('pide los últimos seis meses hasta hoy y pinta la fila con ingresos, gastos y neto', async () => {
    render(<ExpensesSummaryView token="t" />);

    const row = await screen.findByTestId('summary-row');
    expect(mockedSummary).toHaveBeenCalledWith('t', {
      from: '2026-05-01',
      to: '2026-10-31',
    });
    expect(within(row).getByText('Octubre de 2026')).toBeInTheDocument();
    expect(within(row).getByText('Sede principal')).toBeInTheDocument();
    expect(within(row).getByText('COP')).toBeInTheDocument();
    expect(within(row).getByText(/5\.000\.000,00/)).toBeInTheDocument();
    expect(within(row).getByText(/1\.500\.000,00/)).toBeInTheDocument();
  });

  it('muestra el esqueleto mientras carga', () => {
    mockedSummary.mockReturnValue(new Promise(() => undefined));
    render(<ExpensesSummaryView token="t" />);

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(screen.queryByTestId('summary-row')).not.toBeInTheDocument();
  });

  it('sin movimientos enseña el estado vacío y no deja exportar', async () => {
    mockedSummary.mockResolvedValue(summary([]));
    render(<ExpensesSummaryView token="t" />);

    expect(await screen.findByText('No hay movimientos en este periodo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
  });

  it('un fallo de carga ofrece Reintentar y recupera la tabla', async () => {
    const user = setupUser();
    mockedSummary.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ExpensesSummaryView token="t" />);

    expect(await screen.findByText('No pudimos cargar el resumen.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByTestId('summary-row')).toBeInTheDocument();
    expect(mockedSummary).toHaveBeenCalledTimes(2);
  });

  it('un 403 enseña el aviso de acceso y no la barra de filtros', async () => {
    mockedSummary.mockRejectedValue(new ApiError(403, 'Forbidden'));
    render(<ExpensesSummaryView token="t" />);

    expect(await screen.findByText('Tu rol no tiene acceso al resumen de gastos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });

  it('despliega el desglose por categoría de una fila', async () => {
    const user = setupUser();
    render(<ExpensesSummaryView token="t" />);

    const toggle = await screen.findByRole('button', {
      name: /^Ver gastos por categoría de Octubre de 2026, Sede principal: .*3\.500\.000,00/,
    });
    // WCAG 2.5.3: el nombre accesible contiene el texto visible del botón.
    expect(toggle.textContent).toMatch(/3\.500\.000,00/);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const list = screen.getByRole('list', { name: 'Gastos por categoría' });
    expect(within(list).getByText('Arriendo')).toBeInTheDocument();
    expect(within(list).getByText(/2\.500\.000,00/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('cada moneda va en su fila: nunca se suman, y un neto negativo se ve como tal', async () => {
    mockedSummary.mockResolvedValue(
      summary([
        copRow,
        {
          ...copRow,
          currency: 'USD',
          income: 100,
          categories: [],
          expensesTotal: 250,
          net: -150,
        },
      ]),
    );
    render(<ExpensesSummaryView token="t" />);

    const rows = await screen.findAllByTestId('summary-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('COP')).toBeInTheDocument();
    expect(within(rows[1]).getByText('USD')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/150,00/)).toHaveClass('text-danger');
    // Ningún importe es la suma de las dos monedas (5.000.100 / 1.349.850 / …).
    expect(screen.queryByText(/5\.000\.100|1\.349\.850|3\.500\.250/)).not.toBeInTheDocument();
    expect(screen.getByText(/nunca se suman ni se convierten/)).toBeInTheDocument();
  });

  it('exporta el CSV del rango con el nombre del periodo', async () => {
    const user = setupUser();
    render(<ExpensesSummaryView token="t" />);

    await screen.findByTestId('summary-row');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(saveCsv).toHaveBeenCalled());
    expect(mockedCsv).toHaveBeenCalledWith('t', {
      from: '2026-05-01',
      to: '2026-10-31',
    });
    expect(saveCsv).toHaveBeenCalledWith('csv', 'resumen-gastos-2026-05-01-2026-10-31.csv', { bom: true });
    expect(await screen.findByText('Resumen exportado.')).toBeInTheDocument();
  });

  it('si la exportación falla avisa con la opción de reintentar', async () => {
    const user = setupUser();
    mockedCsv.mockRejectedValue(new ApiError(500, 'boom'));
    render(<ExpensesSummaryView token="t" />);

    await screen.findByTestId('summary-row');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(saveCsv).not.toHaveBeenCalled();
    expect(jest.mocked(notifyError).mock.calls[0][0]).toBe('No pudimos exportar el resumen.');
  });

  it('un rango de más de 366 días se avisa y no se pide; los selectores lo acotan a 12 meses', async () => {
    render(<ExpensesSummaryView token="t" />);
    await screen.findByTestId('summary-row');

    const from = screen.getByLabelText('Desde');
    const to = screen.getByLabelText('Hasta');
    expect(from).toHaveAttribute('min', '2025-11');
    expect(to).toHaveAttribute('max', '2027-04');

    mockedSummary.mockClear();
    fireEvent.change(from, { target: { value: '2024-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/como máximo 12 meses/);
    expect(mockedSummary).not.toHaveBeenCalledWith('t', expect.objectContaining({ from: '2024-01-01' }));
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
  });

  it('muestra el mensaje en español del 400 del servidor', async () => {
    mockedSummary.mockRejectedValue(new ApiError(400, 'El periodo no puede superar 366 días'));
    render(<ExpensesSummaryView token="t" />);

    expect(await screen.findByText('El periodo no puede superar 366 días')).toBeInTheDocument();
  });

  it('con más de una sede activa filtra por sede', async () => {
    const user = setupUser();
    render(<ExpensesSummaryView token="t" />);
    await screen.findByTestId('summary-row');

    await user.selectOptions(screen.getByLabelText('Sede'), 'loc-2');

    await waitFor(() =>
      expect(mockedSummary).toHaveBeenLastCalledWith('t', {
        from: '2026-05-01',
        to: '2026-10-31',
        locationId: 'loc-2',
      }),
    );
  });

  it('un mes incompleto no dispara el aviso ni una petición', async () => {
    render(<ExpensesSummaryView token="t" />);
    await screen.findByTestId('summary-row');
    mockedSummary.mockClear();

    const from = screen.getByLabelText('Desde');
    expect(from).toHaveAttribute('placeholder', 'AAAA-MM');
    fireEvent.change(from, { target: { value: '' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockedSummary).not.toHaveBeenCalled();

    fireEvent.change(from, { target: { value: '2026-08' } });
    await waitFor(() => expect(mockedSummary).toHaveBeenCalledWith('t', { from: '2026-08-01', to: '2026-10-31' }));
  });

  it('elige el mes según la zona guardada en el horario, no la inferida del país', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    try {
      // Auckland ya está en noviembre; el listado fixture sigue indicando Bogotá.
      render(<ExpensesSummaryView token="t" />);
      await act(async () => {});
      expect(mockedSummary).toHaveBeenCalledWith('t', { from: '2026-06-01', to: '2026-11-30' });
    } finally { jest.useRealTimers(); }
  });

  it('preserva el aviso de configuración de la API y permite reintentar tras configurarla', async () => {
    const user = setupUser();
    const message = 'Configura una zona horaria válida para la sede y vuelve a intentarlo.';
    mockedSummary.mockRejectedValueOnce(new ApiError(409, message));
    render(<ExpensesSummaryView token="t" />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('summary-row')).toBeInTheDocument();
  });

  it('si la configuración tarda, ofrece reintentar sin inventar zona ni consultar un periodo', async () => {
    jest.useFakeTimers();
    try {
      mockRequestLocations.mockReturnValue(new Promise(() => undefined));
      render(<ExpensesSummaryView token="t" />);
      await act(async () => { jest.advanceTimersByTime(8000); });
      expect(screen.getByText(/No pudimos obtener la zona horaria de la sede/)).toBeInTheDocument();
      expect(mockedSummary).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    } finally { jest.useRealTimers(); }
  });

  it('si falla la carga de sedes, reintenta y obtiene el periodo de la configuración real', async () => {
    const user = setupUser();
    mockRequestLocations.mockRejectedValueOnce(new Error('offline'));
    render(<ExpensesSummaryView token="t" />);
    expect(await screen.findByText(/No pudimos obtener la zona horaria de la sede/)).toBeInTheDocument();
    expect(mockedSummary).not.toHaveBeenCalled();
    // DX-378: el formato de la sede también lee las sedes; lo que cuenta es que Reintentar vuelve a leerlas.
    const readsBefore = mockRequestLocations.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('summary-row')).toBeInTheDocument();
    expect(mockRequestLocations.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('una zona inválida no tiene respaldo y deja consultar un rango manual explícito', async () => {
    jest.mocked(getLocationSchedule).mockResolvedValue({ timezone: 'Invalid/Zone', ranges: [] });
    render(<ExpensesSummaryView token="t" />);
    expect(await screen.findByText(/No pudimos obtener la zona horaria de la sede/)).toBeInTheDocument();
    expect(mockedSummary).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08' } });
    expect(mockedSummary).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09' } });
    expect(await screen.findByTestId('summary-row')).toBeInTheDocument();
    expect(mockedSummary).toHaveBeenCalledWith('t', { from: '2026-08-01', to: '2026-09-30' });
  });

  it('sin horario configurado no usa la zona inferida por país del listado de sedes', async () => {
    jest.mocked(getLocationSchedule).mockResolvedValue(null);
    render(<ExpensesSummaryView token="t" />);
    expect(await screen.findByText(/No pudimos obtener la zona horaria de la sede/)).toBeInTheDocument();
    expect(mockedSummary).not.toHaveBeenCalled();
  });

  it('la zona real que llega tarde no cambia el rango que la persona ya eligió', async () => {
    let resolveLocations!: (value: typeof expenseLocations) => void;
    mockRequestLocations.mockReturnValue(new Promise((resolve) => { resolveLocations = resolve; }));
    render(<ExpensesSummaryView token="t" />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09' } });
    await screen.findByTestId('summary-row');
    await act(async () => resolveLocations(expenseLocations));
    expect(mockedSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-08');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-09');
  });
});

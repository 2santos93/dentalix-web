import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationsComparisonView } from './locations-comparison-view';
import {
  downloadLocationsComparisonCsv,
  getLocationsComparison,
  type ComparisonRow,
  type KpiDefinition,
  type LocationsComparison,
  type Metric,
} from '@/lib/reports/reports-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/patient-imports/patient-imports-api';

jest.mock('../../lib/reports/reports-api', () => ({
  getLocationsComparison: jest.fn(),
  downloadLocationsComparisonCsv: jest.fn(),
}));
jest.mock('../../lib/patient-imports/patient-imports-api', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  useSedeTimeZone: () => 'America/Bogota',
  sedeToday: () => '2026-10-24',
}));

const mockedGet = getLocationsComparison as jest.MockedFunction<typeof getLocationsComparison>;
const mockedCsv = downloadLocationsComparisonCsv as jest.MockedFunction<typeof downloadLocationsComparisonCsv>;

const KPIS: KpiDefinition[] = [
  ['production', 'Producción', 'MONEY', true, 'HIGHER_IS_BETTER'],
  ['collected', 'Cobrado', 'MONEY', true, 'HIGHER_IS_BETTER'],
  ['collectionRate', '% de cobro', 'PERCENT', true, 'HIGHER_IS_BETTER'],
  ['completedAppointments', 'Citas atendidas', 'COUNT', false, 'HIGHER_IS_BETTER'],
  ['noShowRate', 'No-show %', 'PERCENT', false, 'LOWER_IS_BETTER'],
  ['newPatients', 'Pacientes nuevos', 'COUNT', false, 'HIGHER_IS_BETTER'],
  ['averageTicket', 'Ticket medio', 'MONEY', true, 'HIGHER_IS_BETTER'],
  ['occupancy', 'Ocupación %', 'PERCENT', false, 'HIGHER_IS_BETTER'],
].map(([key, label, unit, perCurrency, direction]) => ({
  key: key as KpiDefinition['key'],
  label: label as string,
  unit: unit as KpiDefinition['unit'],
  perCurrency: perCurrency as boolean,
  direction: direction as KpiDefinition['direction'],
  howItIsCalculated: `Definición de ${label as string}.`,
}));

const m = (value: number | null, previous: number | null = null, change: number | null = null, trend: Metric['trend'] = null): Metric => ({
  value,
  previous,
  changePercent: change,
  trend,
});

function row(name: string, id: string | null, production: [string, Metric][], noShow: Metric): ComparisonRow {
  const money = production.map(([currency, metric]) => ({ currency, ...metric }));
  return {
    locationId: id,
    name,
    isActive: true,
    timeZone: id ? 'America/Bogota' : null,
    hasActivity: true,
    metrics: {
      production: money,
      collected: money,
      collectionRate: money,
      completedAppointments: m(10),
      noShowRate: noShow,
      newPatients: m(1),
      averageTicket: money,
      occupancy: m(null),
    },
  };
}

function report(overrides: Partial<LocationsComparison> = {}): LocationsComparison {
  return {
    from: '2026-10-01',
    to: '2026-10-24',
    compare: 'previous',
    previousFrom: '2026-09-07',
    previousTo: '2026-09-30',
    currency: null,
    kpis: KPIS,
    locations: [
      row('Sede principal', 'l1', [['COP', m(12, 10, 20, 'BETTER')]], m(10, 8, 25, 'WORSE')),
      row('Sede Norte', 'l2', [['USD', m(300, 300, 0, 'EQUAL')]], m(5, 5, 0, 'EQUAL')),
    ],
    total: row(
      'Total clínica',
      null,
      [
        ['COP', m(12, 10, 20, 'BETTER')],
        ['USD', m(300, 300, 0, 'EQUAL')],
      ],
      m(7.5, 6.5, 15.4, 'WORSE'),
    ),
    hasActivity: true,
    ...overrides,
  };
}

const table = () => screen.getByRole('table', { name: 'Indicadores por sede y total de la clínica' });

describe('LocationsComparisonView (DX-014)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue(report());
  });

  it('pide «Este mes» comparado con el período anterior por defecto', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-10-01', to: '2026-10-24', compare: 'previous' });
    expect(screen.getByText('Del 01/10/2026 al 24/10/2026, comparado con 07/09/2026 – 30/09/2026')).toBeInTheDocument();
  });

  it('una fila por sede y «Total clínica»; cada moneda por separado', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const rows = within(table()).getAllByRole('row');
    expect(rows.map((r) => within(r).queryByRole('rowheader')?.textContent)).toEqual([
      undefined,
      'Sede principal',
      'Sede Norte',
      'Total clínica',
    ]);
    const total = screen.getByTestId('comparison-total');
    const production = within(total).getAllByRole('cell')[0];
    expect(production).toHaveTextContent(/12,00/);
    expect(production).toHaveTextContent(/300,00/);
  });

  it('variación con flecha, color y texto accesible: +20 % mejora, no-show +25 % empeora', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const principal = screen.getAllByTestId('comparison-row')[0];
    const better = within(principal).getAllByText('+20 %')[0].parentElement!;
    expect(better).toHaveAttribute('data-trend', 'BETTER');
    expect(better).toHaveClass('text-success');
    expect(better.querySelector('svg')).not.toBeNull();
    expect(within(principal).getAllByText(/^Mejora: \+20 % frente a/)[0]).toHaveClass('sr-only');
    const worse = within(principal).getByText('+25 %').parentElement!;
    expect(worse).toHaveAttribute('data-trend', 'WORSE');
    expect(worse).toHaveClass('text-danger');
    expect(within(principal).getByText('Empeora: +25 % frente a 8 %')).toBeInTheDocument();
  });

  it('ordena por columna con aria-sort y el total sigue abajo', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const header = screen.getByRole('columnheader', { name: /No-show %/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: /Sede/ })).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button', { name: 'No-show %' }));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getAllByTestId('comparison-row').map((r) => r.querySelector('th')?.textContent)).toEqual([
      'Sede principal',
      'Sede Norte',
    ]);
    await userEvent.click(within(header).getByRole('button', { name: 'No-show %' }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByTestId('comparison-row').map((r) => r.querySelector('th')?.textContent)).toEqual([
      'Sede Norte',
      'Sede principal',
    ]);
  });

  it('cada columna explica cómo se calcula', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const button = within(table()).getByRole('button', { name: 'Cómo se calcula: Producción' });
    expect(button).toHaveAccessibleDescription('Definición de Producción.');
    await userEvent.hover(button);
    expect(screen.getAllByRole('tooltip').find((t) => !t.hidden)).toHaveTextContent('Definición de Producción.');
  });

  it('cambiar período y comparación vuelve a pedir el reporte', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'last_month');
    await userEvent.selectOptions(screen.getByLabelText('Comparar con'), 'previous_year');
    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith('t', { from: '2026-09-01', to: '2026-09-30', compare: 'previous_year' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'custom');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-09-30');
  });

  it('sin comparación no pinta variaciones', async () => {
    mockedGet.mockResolvedValue(report({ compare: 'none', previousFrom: null, previousTo: null }));
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    expect(screen.queryByText('+20 %')).not.toBeInTheDocument();
    expect(screen.getByText('Del 01/10/2026 al 24/10/2026')).toBeInTheDocument();
  });

  it('exporta el CSV con los filtros activos', async () => {
    mockedCsv.mockResolvedValue('csv');
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Comparar con'), 'none');
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(mockedCsv).toHaveBeenCalledWith('t', { from: '2026-10-01', to: '2026-10-24', compare: 'none' }),
    );
    expect(saveCsv).toHaveBeenCalledWith('csv', 'comparar-sedes-2026-10-01-2026-10-24.csv');
    expect(await screen.findByText('Reporte exportado.')).toBeInTheDocument();
  });

  it('vacío: «No hay actividad en este período»', async () => {
    mockedGet.mockResolvedValue(report({ hasActivity: false }));
    render(<LocationsComparisonView token="t" />);
    expect(await screen.findByText('No hay actividad en este período')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedGet.mockRejectedValueOnce(new Error('caída'));
    render(<LocationsComparisonView token="t" />);
    expect(await screen.findByText('No pudimos cargar la comparación de sedes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('carga con skeleton', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<LocationsComparisonView token="t" />);
    expect(screen.getByRole('status', { name: 'Cargando la comparación' })).toBeInTheDocument();
  });

  it('un rol sin acceso ve el aviso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Solo la administración ve los reportes de la clínica.'));
    render(<LocationsComparisonView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a los reportes.')).toBeInTheDocument();
  });

  it('en móvil: tarjetas por sede con el total y su propio orden', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const cards = within(screen.getByRole('list', { name: 'Indicadores por sede' })).getAllByRole('listitem');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Sede principal',
      'Sede Norte',
      'Total clínica',
    ]);
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'noShowRate');
    expect(screen.getAllByTestId('comparison-card').map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Sede principal',
      'Sede Norte',
    ]);
  });
});

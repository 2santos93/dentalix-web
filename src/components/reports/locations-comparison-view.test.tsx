import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { saveCsv } from '@/lib/files/save-csv';
import { SEDE_TIME_ZONE_ERROR, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SEDE_LOCALE_ERROR, useSedeFormat } from '@/lib/locations/use-sede-format';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/reports/reports-api', () => ({
  getLocationsComparison: jest.fn(),
  downloadLocationsComparisonCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Bogota' })),
  sedeToday: () => '2026-10-24',
}));

// DX-378 (FE-078): el formato de la sede. es-ES deja «+20 %» y «100.000,00» de estas pruebas.
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedZone = useSedeTimeZone as jest.MockedFunction<typeof useSedeTimeZone>;
const mockedFormat = useSedeFormat as jest.MockedFunction<typeof useSedeFormat>;
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
  changeUnit: (unit === 'PERCENT' ? 'POINTS' : 'PERCENT') as KpiDefinition['changeUnit'],
  howItIsCalculated: `Definición de ${label as string}.`,
}));

const m = (value: number | null, previous: number | null = null, change: number | null = null, trend: Metric['trend'] = null): Metric => ({
  value,
  previous,
  change,
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
    previousPeriodUnattributed: false,
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
      row('Sede principal', 'l1', [['COP', m(12, 10, 20, 'BETTER')]], m(10, 8, 2, 'WORSE')),
      row('Sede Norte', 'l2', [['USD', m(300, 300, 0, 'EQUAL')]], m(5, 5, 0, 'EQUAL')),
    ],
    total: row(
      'Total clínica',
      null,
      [
        ['COP', m(12, 10, 20, 'BETTER')],
        ['USD', m(300, 300, 0, 'EQUAL')],
      ],
      m(7.5, 6.5, 1, 'WORSE'),
    ),
    hasActivity: true,
    previousPeriodUnattributed: false,
    ...overrides,
  };
}

const table = () => screen.getByRole('table', { name: 'Indicadores por sede y total de la clínica' });

describe('LocationsComparisonView (DX-014)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedZone.mockReturnValue({ status: 'ready', timeZone: 'America/Bogota' });
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'es-ES', hourCycle: 'h23' }) });
    mockedGet.mockResolvedValue(report());
  });

  it('DX-378 (FE-078): cifras, % y fechas con el formato de la sede (en-US), no con «es»', async () => {
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }) });
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const principal = screen.getAllByTestId('comparison-row')[0];
    expect(within(principal).getAllByText('+20%').length).toBeGreaterThan(0);
    expect(within(principal).getByText('Empeora: +2 p.p. frente a 8%')).toBeInTheDocument();
    expect(screen.getByText(/^Del \d{2}\/\d{2}\/\d{4} al /)).toBeInTheDocument();
  });

  it('DX-378: sin formato de la sede, su error con Reintentar en lugar de las cifras', async () => {
    const retry = jest.fn();
    mockedFormat.mockReturnValue({ status: 'error', message: SEDE_LOCALE_ERROR, retry, locationId: 'loc-1' });
    render(<LocationsComparisonView token="t" />);
    expect(await screen.findByText(SEDE_LOCALE_ERROR)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
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

  it('variación con flecha, color y texto accesible: +20 % mejora, no-show +2 p.p. empeora', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const principal = screen.getAllByTestId('comparison-row')[0];
    const better = within(principal).getAllByText('+20 %')[0].parentElement!;
    expect(better).toHaveAttribute('data-trend', 'BETTER');
    expect(better).toHaveClass('text-success-text');
    expect(better.querySelector('svg')).not.toBeNull();
    expect(within(principal).getAllByText(/^Mejora: \+20 % frente a/)[0]).toHaveClass('sr-only');
    // Los porcentajes varían en puntos (8 % → 10 % = +2 p.p.), no en % relativo.
    expect(within(principal).queryByText('+25 %')).not.toBeInTheDocument();
    const worse = within(principal).getByText('+2 p.p.').parentElement!;
    expect(worse).toHaveAttribute('data-trend', 'WORSE');
    expect(worse).toHaveClass('text-danger-text');
    expect(worse.querySelector('svg')).not.toBeNull();
    expect(within(principal).getByText('Empeora: +2 p.p. frente a 8 %')).toBeInTheDocument();
    expect(within(screen.getByTestId('comparison-total')).getByText('+1 p.p.')).toBeInTheDocument();
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

  it('«Cómo se calcula» se abre al tocarlo y no se cierra en el mismo toque', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    const button = within(table()).getByRole('button', { name: 'Cómo se calcula: No-show %' });
    await userEvent.click(button);
    const open = () => screen.queryAllByRole('tooltip').find((t) => !t.hidden);
    expect(open()).toHaveTextContent('Definición de No-show %.');
    // El navegador táctil emite «salir» del puntero (y el mouseleave de
    // compatibilidad) al levantar el dedo: no debe cerrarla.
    fireEvent.pointerLeave(button, { pointerType: 'touch' });
    fireEvent.mouseLeave(button);
    expect(open()).toHaveTextContent('Definición de No-show %.');
    await userEvent.keyboard('{Escape}');
    expect(open()).toBeUndefined();
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

  it('un período personalizado inválido avisa junto a las fechas, sin pedir el reporte ni «Reintentar»', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'custom');
    mockedGet.mockClear();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2024-01-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 366 días.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('período comparado sin producción atribuida: aviso de una línea, «*» en Producción y % de cobro y «Sin comparar» (BE-045)', async () => {
    const unattributed = { ...m(12, 10), previousUnattributed: true as const };
    const flagged = row('Sede principal', 'l1', [['COP', unattributed]], m(10, 8, 2, 'WORSE'));
    mockedGet.mockResolvedValue(
      report({
        previousPeriodUnattributed: true,
        locations: [{ ...flagged, previousPeriodUnattributed: true }],
        total: { ...row('Total clínica', null, [['COP', unattributed]], m(10, 8, 2, 'WORSE')), previousPeriodUnattributed: true },
      }),
    );
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    expect(screen.getByRole('note')).toHaveTextContent(
      '«Producción» y «% de cobro» no se comparan donde dice «Sin comparar»: el período comparado tiene procedimientos realizados antes de registrar su sede («Sin atribuir») o cobros sin producción.',
    );
    const headers = within(table()).getAllByRole('columnheader');
    const marked = headers.filter((h) => within(h).queryByTestId('unattributed-mark'));
    expect(marked.map((h) => within(h).getAllByRole('button')[0].textContent?.replace('*', ''))).toEqual([
      'Producción',
      '% de cobro',
    ]);
    const [production] = within(screen.getByTestId('comparison-total')).getAllByRole('cell');
    expect(within(production).getByTestId('not-compared')).toHaveTextContent(
      'Sin comparar con 10,00 COP: el período comparado no tiene toda su producción atribuida a una sede.',
    );
    // Sin flecha ni color de mejora en esa celda.
    expect(production.querySelector('[data-trend]')).toBeNull();
  });

  it('sin la bandera no hay aviso ni marca', async () => {
    render(<LocationsComparisonView token="t" />);
    await screen.findByRole('table');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('unattributed-mark')).toHaveLength(0);
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
    expect(saveCsv).toHaveBeenCalledWith('csv', 'comparar-sedes-2026-10-01-2026-10-24.csv', { bom: true });
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

  it('consumers render SedeConfigError without a zone', async () => {
    const retry = jest.fn();
    mockedZone.mockReturnValue({ status: 'error', message: SEDE_TIME_ZONE_ERROR, retry });
    render(<LocationsComparisonView token="t" />);
    expect(
      await screen.findByText('No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.'),
    ).toBeInTheDocument();
    // Sin zona no hay período por defecto: no se consulta con otra zona.
    expect(mockedGet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

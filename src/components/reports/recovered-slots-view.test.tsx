import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveredSlotsView } from './recovered-slots-view';
import {
  downloadRecoveredSlotsCsv,
  getRecoveredSlots,
  type RecoveredSlotsMetrics,
  type RecoveredSlotsReport,
} from '@/lib/reports/recovered-slots-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { listLocations } from '@/lib/locations/locations-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=huecos-recuperados');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('../../lib/reports/recovered-slots-api', () => ({
  ...jest.requireActual('../../lib/reports/recovered-slots-api'),
  getRecoveredSlots: jest.fn(),
  downloadRecoveredSlotsCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-11',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = getRecoveredSlots as jest.MockedFunction<typeof getRecoveredSlots>;
const mockedCsv = downloadRecoveredSlotsCsv as jest.MockedFunction<typeof downloadRecoveredSlotsCsv>;
const mockedSave = saveCsv as jest.MockedFunction<typeof saveCsv>;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function metrics(overrides: Partial<RecoveredSlotsMetrics> = {}): RecoveredSlotsMetrics {
  return {
    freedSlots: 4,
    freedMinutes: 120,
    filledSlots: 3,
    partiallyFilledSlots: 1,
    recoveredMinutes: 75,
    filledByListSlots: 2,
    fillRate: 0.75,
    filledWithin30MinRate: 0.25,
    filledWithin24hRate: 0.5,
    meanMinutesToFill: 65,
    cancellationRate: 0.125,
    offers: { sent: 5, accepted: 2, declined: 1, unanswered: 2 },
    recoveredValue: [
      { currency: 'USD', amount: 150 },
      { currency: 'VES', amount: 3650.5 },
    ],
    unvaluedRecoveredSlots: 1,
    ...overrides,
  };
}

function report(overrides: Partial<RecoveredSlotsReport> = {}): RecoveredSlotsReport {
  return {
    from: '2026-11-01',
    to: '2026-11-11',
    locationId: null,
    providerId: null,
    restrictedToLocations: false,
    totals: metrics(),
    byProvider: [{ providerId: 'p-1', providerName: 'Lina Hueco', ...metrics() }],
    byWeek: [{ weekStart: '2026-11-02', ...metrics() }],
    ...overrides,
  };
}

function mockPhone(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('RecoveredSlotsView (DX-436)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=huecos-recuperados');
    jest.mocked(useSedeFormat).mockReturnValue({
      status: 'ready',
      fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
    } as ReturnType<typeof useSedeFormat>);
    jest.mocked(listLocations).mockResolvedValue([
      clinicLocation({ id: 'loc-1', name: 'Sede Centro' }),
      clinicLocation({ id: 'loc-2', name: 'Sede Este' }),
    ]);
    jest.mocked(listStaff).mockResolvedValue([
      { userId: 'p-1', fullName: 'Lina Hueco', role: 'DENTIST', locationIds: null },
      { userId: 'r-1', fullName: 'Rita Recepción', role: 'RECEPTION', locationIds: null },
    ]);
    mockedGet.mockResolvedValue(report());
  });

  it('pide el mes en curso de la sede (entero) y pinta el resumen', async () => {
    render(<RecoveredSlotsView token="t" isAdmin />);
    await screen.findByTestId('recovered-freed');
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-01', to: '2026-11-30' });
    expect(flat(screen.getByTestId('recovered-freed').textContent)).toContain('4');
    expect(flat(screen.getByTestId('recovered-freed').textContent)).toContain('2 h de agenda');
    expect(flat(screen.getByTestId('recovered-filled').textContent)).toContain('1 de ellos en parte');
    expect(flat(screen.getByTestId('recovered-by-list').textContent)).toContain('2');
    expect(flat(screen.getByTestId('recovered-fill-rate').textContent)).toMatch(/75\s?%/);
    expect(flat(screen.getByTestId('recovered-within-30').textContent)).toMatch(/25\s?%/);
    expect(flat(screen.getByTestId('recovered-within-24h').textContent)).toMatch(/50\s?%/);
    expect(flat(screen.getByTestId('recovered-mean').textContent)).toContain('1 h 05 min');
    expect(flat(screen.getByTestId('offers-sent').textContent)).toContain('5');
    expect(flat(screen.getByTestId('offers-unanswered').textContent)).toContain('2');
    expect(flat(screen.getByTestId('recovered-unvalued').textContent)).toContain('1 hueco recuperado sin valorar');
  });

  it('la tasa de cancelación va justo al lado de la de relleno', async () => {
    render(<RecoveredSlotsView token="t" isAdmin />);
    const fill = await screen.findByTestId('recovered-fill-rate');
    expect(fill.nextElementSibling).toBe(screen.getByTestId('recovered-cancellation-rate'));
    expect(flat(fill.nextElementSibling?.textContent)).toMatch(/12,5\s?%/);
  });

  it('el valor recuperado va por moneda, nunca sumado', async () => {
    render(<RecoveredSlotsView token="t" isAdmin />);
    await screen.findByTestId('recovered-freed');
    const values = screen.getAllByTestId('recovered-value').map((el) => flat(el.textContent));
    expect(values).toHaveLength(2);
    expect(values[0]).toMatch(/USD/);
    expect(values[0]).not.toMatch(/VES/);
    expect(values[1]).toMatch(/VES/);
    expect(values[1]).toContain('3.650,50');
    expect(document.body.textContent).not.toContain('3.800,50');
  });

  it('tasas y tiempo medio sin base se pintan «—»', async () => {
    mockedGet.mockResolvedValue(
      report({
        totals: metrics({
          fillRate: null,
          cancellationRate: null,
          filledWithin30MinRate: null,
          filledWithin24hRate: null,
          meanMinutesToFill: null,
          recoveredValue: [],
          unvaluedRecoveredSlots: 0,
        }),
      }),
    );
    render(<RecoveredSlotsView token="t" isAdmin />);
    await screen.findByTestId('recovered-freed');
    for (const id of [
      'recovered-fill-rate',
      'recovered-cancellation-rate',
      'recovered-within-30',
      'recovered-within-24h',
      'recovered-mean',
    ]) {
      expect(within(screen.getByTestId(id)).getByText('—')).toBeInTheDocument();
    }
    expect(screen.getByTestId('recovered-value')).toHaveTextContent('Sin valor recuperado');
    expect(screen.queryByTestId('recovered-unvalued')).not.toBeInTheDocument();
  });

  it('tablas por profesional y por semana (etiqueta con el formato de la sede)', async () => {
    render(<RecoveredSlotsView token="t" isAdmin />);
    const byProvider = await screen.findByRole('table', { name: 'Huecos recuperados por profesional' });
    expect(within(byProvider).getByText('Lina Hueco')).toBeInTheDocument();
    const byWeek = screen.getByRole('table', { name: 'Huecos recuperados por semana' });
    expect(within(byWeek).getByText('Semana del 02/11/2026')).toBeInTheDocument();
  });

  it('a 390 px las tablas son tarjetas apiladas (listas), sin tabla', async () => {
    const restore = mockPhone(true);
    try {
      render(<RecoveredSlotsView token="t" isAdmin />);
      await screen.findByTestId('recovered-freed');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const list = screen.getByRole('list', { name: 'Huecos recuperados por profesional' });
      const card = within(list).getAllByRole('listitem')[0];
      expect(flat(card.textContent)).toContain('Lina Hueco');
      expect(flat(card.textContent)).toMatch(/Relleno 75\s?%/);
      expect(flat(card.textContent)).toContain('3 de 4 rellenados');
      expect(screen.getByRole('list', { name: 'Huecos recuperados por semana' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('sin cancelaciones: «Sin cancelaciones en el periodo»', async () => {
    mockedGet.mockResolvedValue(
      report({ totals: metrics({ freedSlots: 0, filledSlots: 0 }), byProvider: [], byWeek: [] }),
    );
    render(<RecoveredSlotsView token="t" isAdmin />);
    expect(await screen.findByText('Sin cancelaciones en el periodo')).toBeInTheDocument();
    expect(screen.queryByTestId('recovered-freed')).not.toBeInTheDocument();
  });

  it('cargando: esqueleto con nombre', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<RecoveredSlotsView token="t" isAdmin />);
    expect(screen.getByRole('status', { name: 'Cargando los huecos recuperados' })).toBeInTheDocument();
  });

  it('error: escalón de sección con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    render(<RecoveredSlotsView token="t" isAdmin />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los huecos recuperados.');
    await userEvent.click(within(alert).getByRole('button'));
    await screen.findByTestId('recovered-freed');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin filtros: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<RecoveredSlotsView token="t" isAdmin={false} />);
    expect(await screen.findByText('Tu rol no tiene acceso a los huecos recuperados.')).toBeInTheDocument();
  });

  it('«Descargar CSV» solo para ADMIN, con los mismos filtros', async () => {
    mockedCsv.mockResolvedValue('a,b');
    search = new URLSearchParams('tab=huecos-recuperados&mes=2026-10&sede=loc-2&profesional=p-1');
    const { unmount } = render(<RecoveredSlotsView token="t" isAdmin />);
    await screen.findByTestId('recovered-freed');
    const filters = { from: '2026-10-01', to: '2026-10-31', locationId: 'loc-2', providerId: 'p-1' };
    expect(mockedGet).toHaveBeenCalledWith('t', filters);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', filters));
    expect(mockedSave).toHaveBeenCalledWith('a,b', 'huecos-recuperados-2026-10-01-2026-10-31.csv', { bom: true });
    unmount();

    render(<RecoveredSlotsView token="t" isAdmin={false} />);
    await screen.findByTestId('recovered-freed');
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('los filtros se escriben en la URL conservando la pestaña; recepción no sale como profesional', async () => {
    render(<RecoveredSlotsView token="t" isAdmin />);
    await screen.findByTestId('recovered-freed');
    const provider = screen.getByLabelText('Profesional');
    await waitFor(() => expect(provider).toBeEnabled());
    expect(within(provider).queryByText('Rita Recepción')).not.toBeInTheDocument();
    await userEvent.selectOptions(provider, 'p-1');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=huecos-recuperados&profesional=p-1', { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText('Mes'), '2026-09');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=huecos-recuperados&mes=2026-09', { scroll: false });
    expect(within(screen.getByLabelText('Mes')).getByText('noviembre de 2026')).toBeInTheDocument();
  });

  it('miembro restringido: «Solo incluye tus sedes.»', async () => {
    mockedGet.mockResolvedValue(report({ restrictedToLocations: true }));
    render(<RecoveredSlotsView token="t" isAdmin />);
    expect(await screen.findByTestId('recovered-restricted')).toHaveTextContent('Solo incluye tus sedes.');
  });
});

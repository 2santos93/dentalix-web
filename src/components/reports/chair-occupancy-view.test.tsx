import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChairOccupancyView } from './chair-occupancy-view';
import {
  downloadChairOccupancyCsv,
  getChairOccupancy,
  type ChairOccupancyMetrics,
  type ChairOccupancyReport,
  type LocationChairOccupancy,
} from '@/lib/reports/chair-occupancy-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=ocupacion-sillones');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('../../lib/reports/chair-occupancy-api', () => ({
  ...jest.requireActual('../../lib/reports/chair-occupancy-api'),
  getChairOccupancy: jest.fn(),
  downloadChairOccupancyCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  // Jueves.
  sedeToday: () => '2026-11-12',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = getChairOccupancy as jest.MockedFunction<typeof getChairOccupancy>;
const mockedCsv = downloadChairOccupancyCsv as jest.MockedFunction<typeof downloadChairOccupancyCsv>;
const mockedSave = saveCsv as jest.MockedFunction<typeof saveCsv>;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function metrics(overrides: Partial<ChairOccupancyMetrics> = {}): ChairOccupancyMetrics {
  return {
    openMinutes: 1200,
    reservedMinutes: 900,
    attendedMinutes: 600,
    noShowMinutes: 60,
    reservedAppointments: 15,
    attendedAppointments: 10,
    noShowAppointments: 2,
    reservedRate: 0.75,
    attendedRate: 0.5,
    ...overrides,
  };
}

function chacao(overrides: Partial<LocationChairOccupancy> = {}): LocationChairOccupancy {
  return {
    locationId: 'loc-1',
    locationName: 'Sede Chacao',
    timeZone: 'America/Caracas',
    hasSchedule: true,
    openMinutesPerChair: 1200,
    holidayDays: 1,
    chairs: [
      { chairId: 'c-1', chairName: 'Sillón 1', active: true, ...metrics() },
      {
        chairId: 'c-2',
        chairName: 'Sillón 2',
        active: false,
        ...metrics({ reservedMinutes: 300, attendedMinutes: 300, noShowMinutes: 0, noShowAppointments: 0, reservedRate: 0.25, attendedRate: 0.25 }),
      },
    ],
    noChair: metrics({ openMinutes: null, reservedMinutes: 45, attendedMinutes: 45, noShowMinutes: 0, noShowAppointments: 0, reservedRate: null, attendedRate: null }),
    totals: metrics({ openMinutes: 2400, reservedMinutes: 1200, attendedMinutes: 900, reservedRate: 0.5, attendedRate: 0.375 }),
    ...overrides,
  };
}

function norte(): LocationChairOccupancy {
  return {
    locationId: 'loc-2',
    locationName: 'Sede Norte',
    timeZone: 'America/Caracas',
    hasSchedule: false,
    openMinutesPerChair: null,
    holidayDays: 0,
    chairs: [
      {
        chairId: 'n-1',
        chairName: 'Sillón A',
        active: true,
        ...metrics({ openMinutes: null, reservedRate: null, attendedRate: null }),
      },
    ],
    noChair: null,
    totals: metrics({ openMinutes: null, reservedRate: null, attendedRate: null }),
  };
}

function report(overrides: Partial<ChairOccupancyReport> = {}): ChairOccupancyReport {
  return {
    from: '2026-11-09',
    to: '2026-11-15',
    locationId: null,
    restrictedToLocations: false,
    locations: [chacao(), norte()],
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

describe('ChairOccupancyView (DX-481)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=ocupacion-sillones');
    jest.mocked(useSedeFormat).mockReturnValue({
      status: 'ready',
      fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
    } as ReturnType<typeof useSedeFormat>);
    jest.mocked(listLocations).mockResolvedValue([
      clinicLocation({ id: 'loc-1', name: 'Sede Chacao' }),
      clinicLocation({ id: 'loc-2', name: 'Sede Norte' }),
    ]);
    mockedGet.mockResolvedValue(report());
  });

  it('pide la semana en curso de la sede (lunes a domingo) y pinta una tabla por sede', async () => {
    render(<ChairOccupancyView token="t" isAdmin />);
    const table = await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-09', to: '2026-11-15' });
    const rows = within(table).getAllByRole('row');
    // Cabecera, dos sillones, «Sin sillón» y total.
    expect(rows).toHaveLength(5);
    expect(flat(rows[1].textContent)).toContain('Sillón 1');
    expect(flat(rows[1].textContent)).toContain('20 h');
    expect(flat(rows[1].textContent)).toContain('15 h');
    expect(flat(rows[1].textContent)).toMatch(/75\s?%/);
    expect(flat(rows[1].textContent)).toMatch(/50\s?%/);
    // Inasistencias: cuántas y cuánto tiempo, aparte.
    expect(flat(rows[1].textContent)).toContain('2 · 1 h');
    expect(flat(rows[2].textContent)).toContain('Sillón 2 (desactivado)');
    expect(flat(rows[3].textContent)).toContain('Sin sillón');
    expect(flat(rows[3].textContent)).toContain('45 min');
    expect(within(rows[3]).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(flat(rows[4].textContent)).toContain('Total de la sede');
    expect(flat(rows[4].textContent)).toContain('40 h');
    expect(screen.getAllByTestId('occupancy-location')[0]).toHaveTextContent('20 h abiertos por sillón · 2 sillones · 1 día festivo');
  });

  it('sede sin horario: aviso «Sin horario» y sin porcentajes', async () => {
    render(<ChairOccupancyView token="t" isAdmin />);
    const table = await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Norte' });
    expect(screen.getByTestId('occupancy-no-schedule')).toHaveTextContent('Sin horario');
    const [, chair] = within(table).getAllByRole('row');
    expect(flat(chair.textContent)).not.toMatch(/%/);
    expect(within(chair).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('«Cómo se calcula» enseña la fórmula', async () => {
    render(<ChairOccupancyView token="t" isAdmin />);
    await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    const how = screen.getByTestId('occupancy-how');
    expect(how).toHaveTextContent('Ocupación = reservados ÷ abiertos.');
    await userEvent.click(within(how).getByRole('button', { name: /Cómo se calcula/ }));
    expect(how).toHaveTextContent('menos los cierres de toda la sede y los festivos');
    expect(how).toHaveTextContent('Las inasistencias reservan el sillón pero no se atienden');
  });

  it('a 390 px cada sillón es una tarjeta (sin tabla ni desplazamiento lateral)', async () => {
    const restore = mockPhone(true);
    try {
      render(<ChairOccupancyView token="t" isAdmin />);
      const list = await screen.findByRole('list', { name: 'Ocupación por sillón de Sede Chacao' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const card = within(list).getAllByRole('listitem')[0];
      expect(flat(card.textContent)).toContain('Sillón 1');
      expect(flat(card.textContent)).toMatch(/75\s?%/);
      expect(flat(card.textContent)).toContain('Reservados 15 h');
      expect(flat(card.textContent)).toMatch(/Atendidos 10 h \(50\s?%\)/);
      expect(flat(card.textContent)).toContain('2 inasistencias (1 h)');
    } finally {
      restore();
    }
  });

  it('atajos de período: hoy, mes entero y personalizado en la URL conservando la pestaña', async () => {
    render(<ChairOccupancyView token="t" isAdmin />);
    await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'dia');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=ocupacion-sillones&periodo=dia', { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'personalizado');
    expect(replace).toHaveBeenLastCalledWith(
      '/reportes?tab=ocupacion-sillones&periodo=personalizado&desde=2026-11-09&hasta=2026-11-15',
      { scroll: false },
    );
    const sede = screen.getByLabelText('Sede');
    await waitFor(() => expect(sede).toBeEnabled());
    await userEvent.selectOptions(sede, 'loc-2');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=ocupacion-sillones&sede=loc-2', { scroll: false });
  });

  it('con `?periodo=mes&sede=` pide el mes entero de esa sede; CSV solo ADMIN con los mismos filtros', async () => {
    mockedCsv.mockResolvedValue('a,b');
    search = new URLSearchParams('tab=ocupacion-sillones&periodo=mes&sede=loc-1');
    const { unmount } = render(<ChairOccupancyView token="t" isAdmin />);
    await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    const filters = { from: '2026-11-01', to: '2026-11-30', locationId: 'loc-1' };
    expect(mockedGet).toHaveBeenCalledWith('t', filters);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', filters));
    expect(mockedSave).toHaveBeenCalledWith('a,b', 'ocupacion-sillones-2026-11-01-2026-11-30.csv', { bom: true });
    unmount();

    render(<ChairOccupancyView token="t" isAdmin={false} />);
    await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('personalizado de más de 366 días: error junto a las fechas, sin pedir nada', async () => {
    search = new URLSearchParams('tab=ocupacion-sillones&periodo=personalizado&desde=2025-01-01&hasta=2026-01-02');
    render(<ChairOccupancyView token="t" isAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El período no es válido');
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeDisabled();
  });

  it('vacío: sin sillones ni citas en ninguna sede', async () => {
    mockedGet.mockResolvedValue(
      report({ locations: [chacao({ chairs: [], noChair: null, totals: metrics({ openMinutes: 0, reservedRate: null }) })] }),
    );
    render(<ChairOccupancyView token="t" isAdmin />);
    expect(await screen.findByText('Sin sillones ni citas')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('una sede sin sillones al lado de otra con ellos: «Esta sede no tiene sillones.»', async () => {
    mockedGet.mockResolvedValue(
      report({ locations: [chacao(), { ...norte(), chairs: [], totals: metrics({ openMinutes: 0 }) }] }),
    );
    render(<ChairOccupancyView token="t" isAdmin />);
    expect(await screen.findByText('Esta sede no tiene sillones.')).toBeInTheDocument();
  });

  it('cargando: esqueleto', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<ChairOccupancyView token="t" isAdmin />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error: escalón de sección con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    render(<ChairOccupancyView token="t" isAdmin />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la ocupación por sillón.');
    await userEvent.click(within(alert).getByRole('button'));
    await screen.findByRole('table', { name: 'Ocupación por sillón de Sede Chacao' });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin sede: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<ChairOccupancyView token="t" isAdmin={false} />);
    expect(await screen.findByText('Tu rol no tiene acceso a la ocupación por sillón.')).toBeInTheDocument();
  });

  it('miembro restringido: «Solo incluye tus sedes.»', async () => {
    mockedGet.mockResolvedValue(report({ restrictedToLocations: true }));
    render(<ChairOccupancyView token="t" isAdmin />);
    expect(await screen.findByTestId('occupancy-restricted')).toHaveTextContent('Solo incluye tus sedes.');
  });
});

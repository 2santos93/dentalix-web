import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { TimingView } from './timing-view';
import {
  downloadTimingCsv,
  getTimingReport,
  type TimingDefinition,
  type TimingFigures,
  type TimingOccupancyWeek,
  type TimingReport,
} from '@/lib/reports/timing-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';
import { notifyError } from '@/components/errors/notify';

let search = new URLSearchParams('tab=tiempos');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('../../lib/reports/timing-api', () => ({
  ...jest.requireActual('../../lib/reports/timing-api'),
  getTimingReport: jest.fn(),
  downloadTimingCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-03-13',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = jest.mocked(getTimingReport);
const mockedCsv = jest.mocked(downloadTimingCsv);
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const KEYS: [TimingDefinition['key'], string, TimingDefinition['unit']][] = [
  ['completed', 'Citas atendidas', 'COUNT'],
  ['withoutTimes', 'Citas sin tiempos', 'COUNT'],
  ['incoherent', 'Citas con tiempos incoherentes', 'COUNT'],
  ['wait', 'Espera en sala', 'MINUTES'],
  ['startDelay', 'Retraso de inicio', 'MINUTES'],
  ['duration', 'Duración real', 'MINUTES'],
  ['planned', 'Duración programada', 'MINUTES'],
  ['durationVsPlanned', 'Real frente a programada', 'PERCENT'],
  ['typeOverrun', 'Tipo que se excede', 'PERCENT'],
  ['availableMinutes', 'Disponibles', 'MINUTES'],
  ['bookedMinutes', 'Citadas', 'MINUTES'],
  ['attendedMinutes', 'Atendidas', 'MINUTES'],
  ['noShowMinutes', 'No-show', 'MINUTES'],
  ['freeMinutes', 'Libres', 'MINUTES'],
  ['occupancy', 'Ocupación', 'PERCENT'],
];
const DEFINITIONS: TimingDefinition[] = KEYS.map(([key, label, unit]) => ({
  key,
  label,
  unit,
  howItIsCalculated: `Definición de ${label}.`,
}));

function figures(overrides: Partial<TimingFigures> = {}): TimingFigures {
  return {
    completed: 24,
    measured: 20,
    withoutTimes: 2,
    incoherent: 2,
    waitAvgMinutes: 9.4,
    waitP90Minutes: 21.5,
    startDelayAvgMinutes: 10.2,
    startDelayP90Minutes: 25.5,
    durationAvgMinutes: 88.1,
    durationP90Minutes: 125.4,
    plannedAvgMinutes: 63,
    durationVsPlannedPercent: 39.8,
    ...overrides,
  };
}

const week = (
  weekStart: string,
  from: string,
  to: string,
  o: Partial<TimingOccupancyWeek> = {},
): TimingOccupancyWeek => ({
  weekStart,
  from,
  to,
  availableMinutes: 1200,
  bookedMinutes: 840,
  attendedMinutes: 810,
  noShowMinutes: 30,
  freeMinutes: 360,
  occupancyPercent: 67.5,
  ...o,
});

function report(overrides: Partial<TimingReport> = {}): TimingReport {
  return {
    from: '2026-02-12',
    to: '2026-03-13',
    scope: 'CLINIC',
    filters: { locationId: null, locationName: null, providerId: null, providerName: null },
    options: {
      locations: [{ id: 'loc-1', name: 'Sede Chacao', isActive: true }],
      professionals: [
        { userId: 'u-1', fullName: 'Dra. Pérez' },
        { userId: 'u-2', fullName: 'Dr. Rondón' },
      ],
    },
    totals: figures(),
    byProfessional: [{ providerId: 'u-1', providerName: 'Dra. Pérez', ...figures() }],
    byAppointmentType: [
      {
        appointmentTypeId: 't-1',
        appointmentTypeName: 'Endodoncia',
        catalogDurationMinutes: 90,
        exceedsPlanned: true,
        ...figures({ completed: 12, measured: 11, durationVsPlannedPercent: 35.2 }),
      },
      {
        appointmentTypeId: null,
        appointmentTypeName: 'Sin tipo de cita',
        catalogDurationMinutes: null,
        exceedsPlanned: false,
        ...figures({ completed: 2, measured: 0, waitAvgMinutes: null, waitP90Minutes: null }),
      },
    ],
    byWeek: [
      { weekStart: '2026-03-02', from: '2026-03-02', to: '2026-03-08', ...figures() },
      { weekStart: '2026-03-09', from: '2026-03-09', to: '2026-03-13', ...figures({ completed: 0, measured: 0 }) },
    ],
    occupancy: {
      professionals: [
        {
          providerId: 'u-1',
          providerName: 'Dra. Pérez',
          hasSchedule: true,
          availableMinutes: 1680,
          bookedMinutes: 1410,
          attendedMinutes: 1350,
          noShowMinutes: 30,
          freeMinutes: 360,
          occupancyPercent: 80.4,
          weeks: [week('2026-03-02', '2026-03-02', '2026-03-08'), week('2026-03-09', '2026-03-09', '2026-03-13')],
        },
        {
          providerId: 'u-2',
          providerName: 'Dr. Rondón',
          hasSchedule: false,
          availableMinutes: 0,
          bookedMinutes: 120,
          attendedMinutes: 90,
          noShowMinutes: 0,
          freeMinutes: 0,
          occupancyPercent: null,
          weeks: [week('2026-03-02', '2026-03-02', '2026-03-08', { availableMinutes: 0, occupancyPercent: null })],
        },
      ],
      totals: {
        availableMinutes: 1680,
        bookedMinutes: 1530,
        attendedMinutes: 1440,
        noShowMinutes: 30,
        freeMinutes: 360,
        occupancyPercent: 85.7,
      },
    },
    thresholds: {
      maxWaitMinutes: 240,
      maxStartGapMinutes: 720,
      minDurationMinutes: 1,
      maxDurationMinutes: 480,
      overrunPercent: 20,
      overrunMinAppointments: 10,
    },
    scopeNote: 'Solo cuentan las citas atendidas (completadas).',
    definitions: DEFINITIONS,
    hasData: true,
    ...overrides,
  };
}

const LAST_30 = { from: '2026-02-12', to: '2026-03-13' };

describe('TimingView (DX-275)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=tiempos');
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
    mockedGet.mockResolvedValue(report());
  });

  it('pide los últimos 30 días y pinta los totales con media y p90, y su definición', async () => {
    const { container } = render(<TimingView token="t" ownByRole={false} />);
    const wait = await screen.findByTestId('timing-total-wait');
    expect(mockedGet).toHaveBeenCalledWith('t', LAST_30);
    expect(flat(wait.textContent)).toContain('9,4 min');
    expect(flat(wait.textContent)).toContain('p90 21,5 min');
    expect(within(wait).getByRole('button', { name: 'Cómo se calcula: Espera en sala' })).toHaveAccessibleDescription(
      'Definición de Espera en sala.',
    );
    expect(flat(screen.getByTestId('timing-total-completed').textContent)).toContain('20 con tiempos válidos');
    expect(flat(screen.getByTestId('timing-total-durationVsPlanned').textContent)).toMatch(/\+39,8 ?%/);
    expect(flat(screen.getByTestId('timing-total-occupancy').textContent)).toMatch(/85,7 ?%/);
    expect(flat(screen.getByTestId('timing-total-occupancy').textContent)).toContain(
      '24 h atendidas de 28 h disponibles',
    );
    expect(await violations(container)).toEqual([]);
  });

  it('«X citas sin tiempos» y las incoherentes, aparte; sin ninguna, sin aviso', async () => {
    const { unmount } = render(<TimingView token="t" ownByRole={false} />);
    const notice = await screen.findByTestId('timing-excluded');
    expect(flat(notice.textContent)).toContain('2 citas sin tiempos · 2 con tiempos incoherentes');
    unmount();
    mockedGet.mockResolvedValue(report({ totals: figures({ withoutTimes: 0, incoherent: 0 }) }));
    render(<TimingView token="t" ownByRole={false} />);
    await screen.findByTestId('timing-total-wait');
    expect(screen.queryByTestId('timing-excluded')).not.toBeInTheDocument();
  });

  it('tablas por profesional, por tipo (con el aviso de los que se exceden) y por semana', async () => {
    render(<TimingView token="t" ownByRole={false} />);
    const pros = await screen.findByRole('table', { name: 'Tiempos por profesional' });
    const perez = within(pros).getByText('Dra. Pérez').closest('tr') as HTMLElement;
    expect(flat(perez.textContent)).toContain('88,1 min');
    expect(flat(perez.textContent)).toContain('p90 125,4 min');

    const types = screen.getByRole('table', { name: 'Tiempos por tipo de cita' });
    const endo = within(types).getByText('Endodoncia').closest('tr') as HTMLElement;
    expect(within(endo).getByTestId('timing-type-exceeds')).toHaveTextContent('Se excede');
    expect(flat(endo.textContent)).toContain('90 min');
    const none = within(types).getByText('Sin tipo de cita').closest('tr') as HTMLElement;
    expect(within(none).queryByTestId('timing-type-exceeds')).not.toBeInTheDocument();
    expect(flat(none.textContent)).toContain('—');
    const overrun = screen.getByTestId('timing-overrun');
    expect(flat(overrun.textContent)).toContain('1 tipo de cita dura más de lo agendado');
    expect(flat(overrun.textContent)).toMatch(/Endodoncia: \+35,2 ?% sobre lo agendado \(11 citas medidas\)/);
    expect(overrun).toHaveTextContent('Definición de Tipo que se excede.');

    const weeks = screen.getByRole('table', { name: 'Tiempos por semana' });
    expect(within(weeks).getByText('02/03/2026 – 08/03/2026')).toBeInTheDocument();
    expect(within(weeks).getByText('09/03/2026 – 13/03/2026')).toBeInTheDocument();
  });

  it('ocupación en horas por profesional, «Sin horario» y el total; semanas por profesional', async () => {
    render(<TimingView token="t" ownByRole={false} />);
    const occ = await screen.findByRole('table', { name: 'Horas y ocupación por profesional' });
    const perez = within(occ).getByText('Dra. Pérez').closest('tr') as HTMLElement;
    expect(flat(perez.textContent)).toMatch(/28 h23,5 h22,5 h0,5 h6 h80,4 ?%/);
    const rondon = within(occ).getByText('Dr. Rondón').closest('tr') as HTMLElement;
    expect(rondon).toHaveTextContent('Sin horario');
    expect(within(occ).getByText('Todo el equipo')).toBeInTheDocument();
    // Con dos profesionales, sus semanas van plegadas (y sin pintar) hasta abrirlas.
    expect(screen.queryByRole('table', { name: 'Ocupación de Dra. Pérez por semana' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Dra. Pérez · por semana'));
    const weeks = await screen.findByRole('table', { name: 'Ocupación de Dra. Pérez por semana' });
    expect(within(weeks).getAllByRole('row')).toHaveLength(3);
    const rondonWeeks = screen.getByTestId('timing-occupancy-weeks-u-2');
    expect(rondonWeeks).not.toHaveAttribute('open');
  });

  it('las definiciones de la API, visibles tal cual, con la nota común', async () => {
    render(<TimingView token="t" ownByRole={false} />);
    const defs = await screen.findByTestId('timing-definitions');
    expect(defs).toHaveTextContent('Solo cuentan las citas atendidas (completadas).');
    expect(within(defs).getAllByRole('term')).toHaveLength(15);
    expect(within(defs).getByTestId('timing-definition-occupancy')).toHaveTextContent(
      'OcupaciónDefinición de Ocupación.',
    );
  });

  it('los filtros se leen de la URL y el profesional se elige (ADMIN)', async () => {
    search = new URLSearchParams(
      'tab=tiempos&periodo=custom&desde=2026-01-01&hasta=2026-03-13&sede=loc-1&profesional=u-1',
    );
    const user = userEvent.setup();
    render(<TimingView token="t" ownByRole={false} />);
    await screen.findByTestId('timing-total-wait');
    expect(mockedGet).toHaveBeenCalledWith('t', {
      from: '2026-01-01',
      to: '2026-03-13',
      locationId: 'loc-1',
      providerId: 'u-1',
    });
    await user.selectOptions(screen.getByLabelText('Profesional'), 'u-2');
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('profesional=u-2'), { scroll: false });
  });

  it('el odontólogo: sin selector de profesional, nunca lo manda y ve «Solo lo tuyo»', async () => {
    search = new URLSearchParams('tab=tiempos&profesional=u-2');
    mockedGet.mockResolvedValue(report({ scope: 'OWN' }));
    render(<TimingView token="t" ownByRole />);
    await screen.findByTestId('timing-total-wait');
    expect(mockedGet).toHaveBeenCalledWith('t', LAST_30);
    expect(screen.queryByLabelText('Profesional')).not.toBeInTheDocument();
    expect(screen.getByTestId('timing-scope')).toHaveTextContent('Solo lo tuyo');
  });

  it('más de 12 meses: el aviso y ninguna petición', async () => {
    search = new URLSearchParams('tab=tiempos&periodo=custom&desde=2025-01-01&hasta=2026-03-13');
    render(<TimingView token="t" ownByRole={false} />);
    expect(await screen.findByText(/caben como mucho 12 meses/)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('el CSV lo genera la API con los mismos filtros; si falla, aviso con reintento', async () => {
    const user = userEvent.setup();
    mockedCsv.mockResolvedValueOnce('a,b');
    render(<TimingView token="t" ownByRole={false} />);
    await screen.findByTestId('timing-total-wait');
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', LAST_30));
    expect(jest.mocked(saveCsv)).toHaveBeenCalledWith('a,b', 'tiempos-de-agenda-2026-02-12-2026-03-13.csv', {
      bom: true,
    });
    expect(await screen.findByText('Informe descargado.')).toBeInTheDocument();
    mockedCsv.mockRejectedValueOnce(new ApiError(500, 'x'));
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(jest.mocked(notifyError)).toHaveBeenCalled());
  });

  it('sin datos: «Sin datos en el período»', async () => {
    mockedGet.mockResolvedValue(report({ hasData: false }));
    render(<TimingView token="t" ownByRole={false} />);
    expect(await screen.findByText('Sin datos en el período')).toBeInTheDocument();
  });

  it('cargando: esqueleto, sin tablas', async () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<TimingView token="t" ownByRole={false} />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.queryByTestId('timing-total-wait')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeDisabled();
  });

  it('si falla, «Reintentar» lo vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Caída'));
    render(<TimingView token="t" ownByRole={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('timing-total-wait')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 del rol: el estado de sin acceso con el texto de la API', async () => {
    const message = 'Solo la administración y los odontólogos ven los tiempos de la agenda.';
    mockedGet.mockRejectedValue(new ApiError(403, message, { messages: [message] }));
    render(<TimingView token="t" ownByRole={false} />);
    const box = await screen.findByTestId('timing-forbidden');
    expect(box).toHaveTextContent('Tu rol no tiene acceso a los tiempos de la agenda.');
    expect(box).toHaveTextContent(message);
  });

  it.each([
    [400, 'El período admite como mucho 12 meses.', ''],
    [403, 'No tienes acceso a esta sede.', '&sede=loc-9'],
    [404, 'Sede no encontrada.', '&sede=loc-9'],
  ])('%i con filtros: el texto de la API en el error de la sección', async (status, message, query) => {
    search = new URLSearchParams(`tab=tiempos${query}`);
    mockedGet.mockRejectedValue(new ApiError(status, message, { messages: [message] }));
    render(<TimingView token="t" ownByRole={false} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('timing-forbidden')).not.toBeInTheDocument();
  });

  it('409 LOCATION_TIMEZONE_REQUIRED: falta la zona de la sede, con reintento', async () => {
    const message = 'Configura la zona horaria de la sede.';
    mockedGet.mockRejectedValueOnce(
      new ApiError(409, message, { messages: [message], code: 'LOCATION_TIMEZONE_REQUIRED', locationId: 'loc-1' }),
    );
    render(<TimingView token="t" ownByRole={false} />);
    expect(await screen.findByText('Falta un dato de la sede')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('timing-total-wait');
  });

  it('a 390 px las tablas siguen siendo tablas dentro de su marco (sin tarjetas)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      render(<TimingView token="t" ownByRole={false} />);
      expect(await screen.findByRole('table', { name: 'Tiempos por profesional' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Tiempos por profesional' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfessionalProductivityView } from './professional-productivity-view';
import { NoShowsView } from './no-shows-view';
import { ReceivablesAgingReportView } from './receivables-aging-report-view';
import {
  downloadNoShowsCsv,
  downloadProfessionalProductivityCsv,
  getNoShows,
  getProfessionalProductivity,
  getReceivablesAgingSummary,
  type MissedAppointment,
  type NoShowsReport,
  type ProfessionalProductivity,
} from '@/lib/reports/professional-reports-api';
import { ApiError } from '@/lib/api/client';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { useSedeFormat } from '@/lib/locations/use-sede-format';
import { saveCsv } from '@/lib/files/save-csv';

let search = new URLSearchParams('tab=profesionales');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('../../lib/reports/professional-reports-api', () => ({
  ...jest.requireActual('../../lib/reports/professional-reports-api'),
  getProfessionalProductivity: jest.fn(),
  downloadProfessionalProductivityCsv: jest.fn(),
  getNoShows: jest.fn(),
  downloadNoShowsCsv: jest.fn(),
  getReceivablesAgingSummary: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-17',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
jest.mock('../../lib/locations/sede-stamp', () => {
  const { stampPainters } = jest.requireActual('../../lib/locations/sede-stamp');
  return { useSedeStamp: () => ({ ...stampPainters(null), ready: true, notice: null, clock: null }) };
});

const usd = (n: number) => moneyWithCode(n, 'USD', fmt);
const ves = (n: number) => moneyWithCode(n, 'VES', fmt);
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');
const PERIOD = { from: '2026-11-01', to: '2026-11-17' };
const options = {
  locations: [{ id: 'loc-1', name: 'Sede Altamira', isActive: true }],
  professionals: [
    { userId: 'u-1', fullName: 'Dra. Marisol Rivas' },
    { userId: 'u-2', fullName: 'Dr. Andrés Mora' },
  ],
};
const filters = { locationId: null, locationName: null, professionalId: null, professionalName: null };

function productivity(overrides: Partial<ProfessionalProductivity> = {}): ProfessionalProductivity {
  const rows = [
    {
      professionalId: 'u-1',
      fullName: 'Dra. Marisol Rivas',
      production: [
        { currency: 'USD', count: 3, net: 450 },
        { currency: 'VES', count: 1, net: 3650 },
      ],
      collected: [{ currency: 'USD', amount: 200 }],
      completedAppointments: 6,
      noShows: 1,
      lateCancellations: 1,
      noShowRate: 12.5,
    },
  ];
  return {
    ...PERIOD,
    scope: 'CLINIC',
    filters,
    options,
    rows,
    totals: { ...rows[0] },
    definitions: [
      {
        key: 'noShowRate',
        label: 'No-show %',
        unit: 'PERCENT',
        perCurrency: false,
        direction: 'LOWER_IS_BETTER',
        changeUnit: 'POINTS',
        howItIsCalculated: 'No asistió ÷ (atendidas + no asistió + tardías).',
      },
    ],
    hasActivity: true,
    ...overrides,
  };
}

function missed(overrides: Partial<MissedAppointment> = {}): MissedAppointment {
  return {
    appointmentId: 'apt-9',
    start: '2026-11-10T14:00:00.000Z',
    end: '2026-11-10T14:30:00.000Z',
    status: 'NO_SHOW',
    kind: 'NO_SHOW',
    cancelReasonCode: null,
    noticeMinutes: null,
    patientId: 'pat-1',
    patientName: 'Ana Pérez',
    patientArchived: false,
    appointmentTypeName: 'Control',
    professionalId: 'u-1',
    professionalName: 'Dra. Marisol Rivas',
    locationId: 'loc-1',
    locationName: 'Sede Altamira',
    timeZone: 'America/Caracas',
    ...overrides,
  };
}

function noShows(overrides: Partial<NoShowsReport> = {}): NoShowsReport {
  return {
    ...PERIOD,
    scope: 'CLINIC',
    filters,
    options,
    summary: { completedAppointments: 6, noShows: 1, lateCancellations: 1, noShowRate: 12.5 },
    definition: productivity().definitions[0],
    items: [
      missed(),
      missed({
        appointmentId: 'apt-8',
        status: 'CANCELLED',
        kind: 'LATE_CANCELLATION',
        cancelReasonCode: 'TRANSPORT',
        noticeMinutes: 90,
        patientName: 'Luis Rangel',
      }),
    ],
    total: 2,
    page: 1,
    pageSize: 25,
    truncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  search = new URLSearchParams('tab=profesionales');
  jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
  jest.mocked(getProfessionalProductivity).mockResolvedValue(productivity());
  jest.mocked(getNoShows).mockResolvedValue(noShows());
});

describe('ProfessionalProductivityView (DX-304)', () => {
  it('pide el mes de la sede y pinta cada profesional con sus importes por moneda, sin mezclar', async () => {
    render(<ProfessionalProductivityView token="t" />);
    const table = await screen.findByRole('table', { name: 'Productividad por profesional' });
    expect(getProfessionalProductivity).toHaveBeenCalledWith('t', PERIOD);
    const row = within(table).getByText('Dra. Marisol Rivas').closest('tr')!;
    expect(flat(row.textContent)).toContain(flat(usd(450)));
    expect(flat(row.textContent)).toContain(flat(ves(3650)));
    expect(flat(row.textContent)).toContain(flat(usd(200)));
    expect(flat(row.textContent)).toContain(flat(fmt.percent(12.5, 1)));
    expect(screen.getByTestId('productivity-total-production')).toBeInTheDocument();
  });

  it('filtros en la URL: elegir profesional reescribe ?profesional= sin navegar', async () => {
    render(<ProfessionalProductivityView token="t" />);
    await screen.findByRole('table', { name: 'Productividad por profesional' });
    await userEvent.selectOptions(screen.getByLabelText('Profesional'), 'u-2');
    expect(replace).toHaveBeenCalledWith('/reportes?tab=profesionales&profesional=u-2', { scroll: false });
  });

  it('el odontólogo (OWN): sin filtro de profesional ni total del equipo', async () => {
    jest.mocked(getProfessionalProductivity).mockResolvedValue(productivity({ scope: 'OWN' }));
    search = new URLSearchParams('tab=profesionales&profesional=u-2');
    render(<ProfessionalProductivityView token="t" ownByRole />);
    await screen.findByRole('table', { name: 'Productividad por profesional' });
    expect(getProfessionalProductivity).toHaveBeenCalledWith('t', PERIOD);
    expect(screen.queryByLabelText('Profesional')).toBeNull();
    expect(screen.queryByTestId('productivity-total-production')).toBeNull();
    expect(screen.getByTestId('productivity-scope')).toHaveTextContent('Solo lo tuyo');
  });

  it('vacío y error con «Reintentar»', async () => {
    jest.mocked(getProfessionalProductivity).mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ProfessionalProductivityView token="t" />);
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    jest.mocked(getProfessionalProductivity).mockResolvedValueOnce(productivity({ rows: [], hasActivity: false }));
    await userEvent.click(retry);
    expect(await screen.findByText('Sin actividad en el período')).toBeInTheDocument();
  });

  it('403 por rol: el aviso, sin tabla', async () => {
    jest.mocked(getProfessionalProductivity).mockRejectedValue(new ApiError(403, 'no'));
    render(<ProfessionalProductivityView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a la productividad por profesional.')).toBeInTheDocument();
  });

  it('CSV con los filtros activos', async () => {
    jest.mocked(downloadProfessionalProductivityCsv).mockResolvedValue('csv');
    search = new URLSearchParams('tab=profesionales&sede=loc-1');
    render(<ProfessionalProductivityView token="t" />);
    await screen.findByRole('table', { name: 'Productividad por profesional' });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(downloadProfessionalProductivityCsv).toHaveBeenCalledWith('t', { ...PERIOD, locationId: 'loc-1' }),
    );
    expect(saveCsv).toHaveBeenCalledWith('csv', 'productividad-profesionales-2026-11-01-2026-11-17.csv', { bom: true });
  });
});

describe('NoShowsView (DX-304)', () => {
  it('el % y la lista con enlace a cada cita', async () => {
    search = new URLSearchParams('tab=inasistencias');
    render(<NoShowsView token="t" isAdmin />);
    expect(flat((await screen.findByTestId('no-shows-rate')).textContent)).toContain(flat(fmt.percent(12.5, 1)));
    expect(getNoShows).toHaveBeenCalledWith('t', PERIOD, 1, 25);
    expect(screen.getByRole('link', { name: 'Abrir la cita de Ana Pérez en la agenda' })).toHaveAttribute(
      'href',
      '/agenda?cita=apt-9',
    );
    const kinds = screen.getAllByTestId('no-show-kind').map((b) => b.textContent);
    expect(kinds).toEqual(['No asistió', 'Cancelada tarde']);
    expect(screen.getByText('Transporte')).toBeInTheDocument();
  });

  it('el CSV solo lo ve ADMIN', async () => {
    jest.mocked(downloadNoShowsCsv).mockResolvedValue('csv');
    const { unmount } = render(<NoShowsView token="t" />);
    await screen.findByTestId('no-shows-rate');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
    unmount();
    render(<NoShowsView token="t" isAdmin />);
    await screen.findByTestId('no-shows-rate');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(downloadNoShowsCsv).toHaveBeenCalledWith('t', PERIOD));
  });

  it('sin faltas: el % y un vacío en la lista', async () => {
    jest.mocked(getNoShows).mockResolvedValue(
      noShows({ items: [], total: 0, summary: { completedAppointments: 4, noShows: 0, lateCancellations: 0, noShowRate: 0 } }),
    );
    render(<NoShowsView token="t" />);
    expect(await screen.findByText('Nadie faltó ni canceló tarde en el período.')).toBeInTheDocument();
  });
});

describe('ReceivablesAgingReportView (DX-304)', () => {
  it('reutiliza el resumen de la cartera por moneda y enlaza la lista', async () => {
    jest.mocked(getReceivablesAgingSummary).mockResolvedValue({
      asOf: '2026-11-17',
      scope: { location: { id: 'loc-1', name: 'Sede Altamira' } },
      totals: [
        {
          currency: 'USD',
          patients: 2,
          balance: 300,
          debt: 300,
          credit: 0,
          buckets: { current: 0, days0to30: 100, days31to60: 0, days61to90: 0, over90: 200 },
        },
        {
          currency: 'VES',
          patients: 1,
          balance: 3650,
          debt: 3650,
          credit: 0,
          buckets: { current: 3650, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0 },
        },
      ],
      paymentsWithoutRateCount: 0,
      rateProviderTimedOut: false,
    });
    render(<ReceivablesAgingReportView token="t" isAdmin />);
    expect(await screen.findByTestId('aging-total-USD')).toBeInTheDocument();
    expect(screen.getByTestId('aging-total-VES')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la cartera con los pacientes' })).toHaveAttribute('href', '/caja/cartera');
    expect(screen.getByTestId('aging-report-scope')).toHaveTextContent('Sede Sede Altamira');
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('nadie debe: el vacío', async () => {
    jest.mocked(getReceivablesAgingSummary).mockResolvedValue({
      asOf: '2026-11-17',
      scope: { location: null },
      totals: [],
      paymentsWithoutRateCount: 0,
      rateProviderTimedOut: false,
    });
    render(<ReceivablesAgingReportView token="t" />);
    expect(await screen.findByText('Nadie debe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
  });
});

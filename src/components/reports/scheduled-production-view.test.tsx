import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduledProductionView } from './scheduled-production-view';
import {
  getScheduledProduction,
  getScheduledProductionUnlinked,
  type ScheduledProductionReport,
  type UnlinkedAppointment,
} from '@/lib/reports/scheduled-production-api';
import { ApiError } from '@/lib/api/client';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=prevision');
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
jest.mock('../../lib/reports/scheduled-production-api', () => ({
  ...jest.requireActual('../../lib/reports/scheduled-production-api'),
  getScheduledProduction: jest.fn(),
  getScheduledProductionUnlinked: jest.fn(),
}));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-17',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = getScheduledProduction as jest.MockedFunction<typeof getScheduledProduction>;
const mockedUnlinked = getScheduledProductionUnlinked as jest.MockedFunction<typeof getScheduledProductionUnlinked>;
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const usd = (n: number) => moneyWithCode(n, 'USD', fmt);
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');
const NOV = { from: '2026-11-01', to: '2026-11-30' };

function report(overrides: Partial<ScheduledProductionReport> = {}): ScheduledProductionReport {
  return {
    period: NOV,
    currency: 'USD',
    scope: 'CLINIC',
    restrictedToLocations: false,
    filters: { locationId: null, providerId: null },
    totals: { scheduledAmount: 100, appointments: 3, appointmentsWithoutItems: 1 },
    byDay: [
      { date: '2026-11-17', scheduledAmount: 0, appointments: 0, appointmentsWithoutItems: 0 },
      { date: '2026-11-18', scheduledAmount: 100, appointments: 3, appointmentsWithoutItems: 1 },
    ],
    byProfessional: [
      { professionalId: 'u-1', name: 'Dra. Marisol Rivas', scheduledAmount: 100, appointments: 3, appointmentsWithoutItems: 1 },
    ],
    byDayAndProfessional: [{ date: '2026-11-18', professionalId: 'u-1', scheduledAmount: 100, appointments: 3 }],
    forecast: {
      month: '2026-11',
      today: '2026-11-17',
      producedToDate: 3200,
      scheduledPending: 1800,
      forecast: 5000,
      itemsWithoutRate: 0,
    },
    withoutRate: { appointments: 0, items: 0 },
    unattributedDone: 0,
    warnings: [],
    definitions: [
      { key: 'SCHEDULED', label: 'Agendado', howItIsCalculated: ['Aceptados y realizados ligados a la cita.'] },
      { key: 'FORECAST', label: 'Previsión', howItIsCalculated: ['Previsión = Producido hasta hoy + Agendado pendiente.'] },
    ],
    options: {
      locations: [
        { id: 'loc-1', name: 'Sede Altamira', isActive: true },
        { id: 'loc-2', name: 'Sede Chacao', isActive: false },
      ],
      professionals: [{ userId: 'u-1', fullName: 'Dra. Marisol Rivas' }],
    },
    ...overrides,
  };
}

function unlinked(overrides: Partial<UnlinkedAppointment> = {}): UnlinkedAppointment {
  return {
    appointmentId: 'apt-9',
    start: '2026-11-18T14:00:00.000Z',
    end: '2026-11-18T14:30:00.000Z',
    status: 'SCHEDULED',
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

describe('ScheduledProductionView (DX-567)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=prevision');
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
    mockedGet.mockResolvedValue(report());
    mockedUnlinked.mockResolvedValue({ items: [unlinked()], total: 1, page: 1, pageSize: 25 });
  });

  it('por defecto pide el mes entero de la sede y pinta la previsión con su fórmula', async () => {
    render(<ScheduledProductionView token="t" />);
    await screen.findByTestId('scheduled-production-forecast');
    expect(mockedGet).toHaveBeenCalledWith('t', NOV);
    expect(screen.getByTestId('scheduled-production-formula')).toHaveTextContent(
      'Producido hasta hoy + Agendado pendiente = Previsión',
    );
    expect(flat(screen.getByTestId('scheduled-production-produced').textContent)).toContain(flat(usd(3200)));
    expect(flat(screen.getByTestId('scheduled-production-pending').textContent)).toContain(flat(usd(1800)));
    expect(flat(screen.getByTestId('scheduled-production-forecast-total').textContent)).toContain(flat(usd(5000)));
    expect(screen.getByTestId('scheduled-production-month')).toHaveTextContent(/noviembre de 2026/);
    expect(flat(screen.getByTestId('scheduled-production-scope').textContent)).toBe(
      'Agenda de la clínica · consolidado de tus sedes · Importes en USD',
    );
  });

  it('agendado por día (todos los días) y por profesional, con importe, citas y sin tratamiento', async () => {
    render(<ScheduledProductionView token="t" />);
    const byDay = await screen.findByRole('table', { name: 'Agendado por día' });
    const rows = within(byDay).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(flat(rows[1].textContent)).toContain(flat(usd(100)));
    const byPro = screen.getByRole('table', { name: 'Agendado por profesional' });
    expect(within(byPro).getByText('Dra. Marisol Rivas')).toBeInTheDocument();
    expect(flat(screen.getByTestId('scheduled-production-total').textContent)).toContain(flat(usd(100)));
  });

  it('la lista sin tratamiento enlaza la cita en la agenda y el plan del paciente', async () => {
    render(<ScheduledProductionView token="t" />);
    const link = await screen.findByRole('link', { name: 'Abrir la cita de Ana Pérez en la agenda' });
    expect(link).toHaveAttribute('href', '/agenda?cita=apt-9');
    expect(screen.getByRole('link', { name: 'Plan de tratamiento de Ana Pérez' })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=treatment-plans',
    );
    expect(mockedUnlinked).toHaveBeenCalledWith('t', NOV, 1, 25);
  });

  it('paciente archivado: «(archivado)» sin enlace a la ficha; el enlace a la cita sí', async () => {
    mockedUnlinked.mockResolvedValue({
      items: [unlinked({ patientArchived: true, patientName: 'Luis Rangel' })],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByTestId('scheduled-production-archived-patient')).toHaveTextContent('Luis Rangel (archivado)');
    expect(screen.queryByRole('link', { name: 'Plan de tratamiento de Luis Rangel' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir la cita de Luis Rangel en la agenda' })).toHaveAttribute(
      'href',
      '/agenda?cita=apt-9',
    );
  });

  it('pinta los importes de la API tal cual (byDay y totals se redondean por separado)', async () => {
    mockedGet.mockResolvedValue(
      report({
        totals: { scheduledAmount: 100.01, appointments: 3, appointmentsWithoutItems: 1 },
        byDay: [
          { date: '2026-11-17', scheduledAmount: 33.33, appointments: 1, appointmentsWithoutItems: 0 },
          { date: '2026-11-18', scheduledAmount: 66.67, appointments: 2, appointmentsWithoutItems: 1 },
        ],
      }),
    );
    render(<ScheduledProductionView token="t" />);
    expect(flat((await screen.findByTestId('scheduled-production-total')).textContent)).toContain(flat(usd(100.01)));
  });

  it('sin citas sin tratamiento no pide la lista', async () => {
    mockedGet.mockResolvedValue(report({ totals: { scheduledAmount: 100, appointments: 2, appointmentsWithoutItems: 0 } }));
    render(<ScheduledProductionView token="t" />);
    await screen.findByTestId('scheduled-production-total');
    expect(mockedUnlinked).not.toHaveBeenCalled();
  });

  it('sin citas en el período: la previsión sigue y el período enseña el vacío', async () => {
    mockedGet.mockResolvedValue(
      report({ totals: { scheduledAmount: 0, appointments: 0, appointmentsWithoutItems: 0 }, byProfessional: [] }),
    );
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByText('Sin citas en el período')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-production-forecast')).toBeInTheDocument();
  });

  it('filtros de la URL: preset, sede y profesional; cambiar el preset reescribe la URL', async () => {
    search = new URLSearchParams('tab=prevision&periodo=next_7_days&sede=loc-1&profesional=u-1');
    render(<ScheduledProductionView token="t" />);
    await screen.findByTestId('scheduled-production-forecast');
    expect(mockedGet).toHaveBeenCalledWith('t', {
      from: '2026-11-17',
      to: '2026-11-23',
      locationId: 'loc-1',
      providerId: 'u-1',
    });
    await userEvent.selectOptions(screen.getByLabelText('Período', { exact: true }), 'next_month');
    expect(replace).toHaveBeenLastCalledWith(
      '/reportes?tab=prevision&periodo=next_month&sede=loc-1&profesional=u-1',
      { scroll: false },
    );
  });

  it('un período de más de 62 días no se pide: aviso en línea', async () => {
    search = new URLSearchParams('tab=prevision&periodo=custom&desde=2026-11-01&hasta=2027-01-15');
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByText(/hasta 62 días/)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('DENTIST sin el permiso: no manda el profesional de la URL ni enseña el filtro', async () => {
    search = new URLSearchParams('tab=prevision&profesional=u-2');
    mockedGet.mockResolvedValue(report({ scope: 'OWN' }));
    render(<ScheduledProductionView token="t" ownByRole />);
    await screen.findByTestId('scheduled-production-forecast');
    expect(mockedGet).toHaveBeenCalledWith('t', NOV);
    expect(screen.queryByLabelText('Profesional de la cita', { exact: true })).toBeNull();
    expect(screen.getByTestId('scheduled-production-scope')).toHaveTextContent(/Solo lo tuyo/);
  });

  it('avisos: restringido, sin moneda, sin tasa, meses mezclados y realizados sin atribuir', async () => {
    mockedGet.mockResolvedValue(
      report({
        restrictedToLocations: true,
        warnings: ['NO_CATALOG_CURRENCY', 'WITHOUT_RATE', 'MIXED_MONTHS', 'UNATTRIBUTED_DONE'],
        withoutRate: { appointments: 2, items: 3 },
        forecast: { ...report().forecast, itemsWithoutRate: 1 },
        unattributedDone: 4,
      }),
    );
    render(<ScheduledProductionView token="t" />);
    await screen.findByTestId('scheduled-production-forecast');
    expect(screen.getByTestId('scheduled-production-restricted')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-production-no-currency')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-production-without-rate')).toHaveTextContent('2 citas tienen');
    expect(screen.getByTestId('scheduled-production-forecast-without-rate')).toHaveTextContent('1 procedimiento');
    expect(screen.getByTestId('scheduled-production-mixed-months')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-production-unattributed')).toHaveTextContent('4 procedimientos realizados');
  });

  it('sin moneda de catálogo los importes son «—»', async () => {
    mockedGet.mockResolvedValue(
      report({
        currency: null,
        warnings: ['NO_CATALOG_CURRENCY'],
        forecast: { ...report().forecast, producedToDate: null, scheduledPending: null, forecast: null },
      }),
    );
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByTestId('scheduled-production-forecast-total')).toHaveTextContent('—');
  });

  it('403 sin filtros: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Solo la administración…'));
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a la producción agendada.')).toBeInTheDocument();
  });

  it('error de carga: mensaje con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ScheduledProductionView token="t" />);
    const retry = await screen.findByRole('button', { name: /reintentar|volver a intentar/i });
    await userEvent.click(retry);
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('scheduled-production-forecast')).toBeInTheDocument();
  });

  it('409 de zona: el aviso de configuración de la sede', async () => {
    mockedGet.mockRejectedValue(
      new ApiError(409, 'La sede no tiene zona horaria.', { messages: ['La sede no tiene zona horaria.'], code: 'LOCATION_TIMEZONE_REQUIRED', locationId: 'loc-1' }),
    );
    render(<ScheduledProductionView token="t" />);
    expect(await screen.findByText('La sede no tiene zona horaria.')).toBeInTheDocument();
  });
});

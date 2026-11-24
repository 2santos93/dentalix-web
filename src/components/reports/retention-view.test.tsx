import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { RetentionView } from './retention-view';
import {
  downloadRetentionCsv,
  downloadRetentionPatientsCsv,
  getRetentionPatients,
  getRetentionReport,
  type RetentionDefinition,
  type RetentionPatient,
  type RetentionPatients,
  type RetentionReport,
} from '@/lib/reports/retention-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=retencion');
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
jest.mock('../../lib/reports/retention-api', () => ({
  ...jest.requireActual('../../lib/reports/retention-api'),
  getRetentionReport: jest.fn(),
  getRetentionPatients: jest.fn(),
  downloadRetentionCsv: jest.fn(),
  downloadRetentionPatientsCsv: jest.fn(),
}));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn(async () => 'Clínica Altamira') }));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-16',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = jest.mocked(getRetentionReport);
const mockedPatients = jest.mocked(getRetentionPatients);
const mockedCsv = jest.mocked(downloadRetentionCsv);
const mockedListCsv = jest.mocked(downloadRetentionPatientsCsv);
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const def = (
  key: RetentionDefinition['key'],
  label: string,
  segment: RetentionDefinition['segment'],
): RetentionDefinition => ({
  key,
  label,
  unit: key === 'retentionRate' ? 'PERCENT' : 'COUNT',
  segment,
  howItIsCalculated: `Definición de ${label}.`,
});

const DEFINITIONS: RetentionDefinition[] = [
  def('activeAtStart', 'Activos al inicio', 'active_start'),
  def('newPatients', 'Nuevos', 'new'),
  def('lost', 'Perdidos', 'lost'),
  def('activeAtEnd', 'Activos al final', 'active_end'),
  def('reactivated', 'Recuperados', 'reactivated'),
  def('retentionRate', 'Retención', null),
  def('newNoReturn', 'Nuevos sin regreso', 'new_no_return'),
];

const figures = { activeAtStart: 10, newPatients: 3, lost: 2, activeAtEnd: 11, reactivated: 0, newNoReturn: 1 };

function report(overrides: Partial<RetentionReport> = {}): RetentionReport {
  return {
    from: '2026-01-01',
    to: '2026-11-16',
    filters: { locationId: null, locationName: null, providerId: null, providerName: null, activeMonths: 18 },
    options: {
      locations: [
        { id: 'loc-1', name: 'Sede Altamira', isActive: true },
        { id: 'loc-2', name: 'Sede Chacao', isActive: true },
      ],
      professionals: [{ userId: 'u-1', fullName: 'Dra. Pérez' }],
    },
    rows: [
      {
        locationId: 'loc-1',
        locationName: 'Sede Altamira',
        providerId: 'u-1',
        providerName: 'Dra. Pérez',
        ...figures,
        retentionRate: 80,
      },
    ],
    locations: [{ locationId: 'loc-1', locationName: 'Sede Altamira', ...figures, retentionRate: 80 }],
    totals: { ...figures, retentionRate: 80 },
    definitions: DEFINITIONS,
    hasData: true,
    ...overrides,
  };
}

function patient(overrides: Partial<RetentionPatient>): RetentionPatient {
  return {
    patientId: 'p-1',
    patientName: 'Ana Rondón',
    phone: '+58 412 555 0101',
    whatsApp: '584125550101',
    reminderOptedOut: false,
    firstVisitAt: '2024-07-01T12:00:00.000Z',
    lastVisitAt: '2024-11-05T14:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Sede Altamira',
    timeZone: 'America/Caracas',
    providerId: 'u-1',
    providerName: 'Dra. Pérez',
    hasUpcomingAppointment: false,
    ...overrides,
  };
}

function patients(): RetentionPatients {
  return {
    from: '2026-01-01',
    to: '2026-11-16',
    segment: 'lost',
    filters: report().filters,
    definition: DEFINITIONS[2],
    items: [
      patient({}),
      patient({ patientId: 'p-2', patientName: 'Luis Guerra', phone: null, whatsApp: null, reminderOptedOut: true }),
    ],
    total: 2,
    page: 1,
    pageSize: 25,
    truncated: false,
  };
}

const THIS_YEAR = { from: '2026-01-01', to: '2026-11-16', activeMonths: 18 };

describe('RetentionView (DX-260)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=retencion');
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
    mockedGet.mockResolvedValue(report());
    mockedPatients.mockResolvedValue(patients());
  });

  it('pide este año con 18 meses y pinta las siete cifras con su definición, en el orden de la API', async () => {
    const { container } = render(<RetentionView token="t" isAdmin />);
    expect(flat((await screen.findByTestId('retention-figure-retentionRate')).textContent)).toMatch(/80\s?%/);
    expect(mockedGet).toHaveBeenCalledWith('t', THIS_YEAR);
    expect(flat(screen.getByTestId('retention-figure-activeAtStart').textContent)).toContain('10');
    expect(flat(screen.getByTestId('retention-figure-lost').textContent)).toContain('2');
    expect(
      within(screen.getByTestId('retention-figure-lost')).getByRole('button', { name: 'Cómo se calcula: Perdidos' }),
    ).toHaveAccessibleDescription('Definición de Perdidos.');
    // Cero no abre lista.
    expect(screen.queryByTestId('retention-open-reactivated')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Retención por sede y profesional' });
    expect(within(table).getByText('Dra. Pérez')).toBeInTheDocument();
    // Una sola sede con filas: sin subtotal por sede.
    expect(screen.queryByRole('table', { name: 'Retención por sede' })).not.toBeInTheDocument();
    expect(await violations(container)).toEqual([]);
  });

  it('los filtros se leen de la URL: período personalizado, sede, profesional y ventana', async () => {
    search = new URLSearchParams(
      'tab=retencion&periodo=custom&desde=2026-01-01&hasta=2026-06-30&sede=loc-1&profesional=u-1&meses=24',
    );
    render(<RetentionView token="t" isAdmin />);
    await screen.findByTestId('retention-figure-lost');
    expect(mockedGet).toHaveBeenCalledWith('t', {
      from: '2026-01-01',
      to: '2026-06-30',
      locationId: 'loc-1',
      providerId: 'u-1',
      activeMonths: 24,
    });
  });

  it('más de 12 meses: el aviso y ninguna petición', async () => {
    search = new URLSearchParams('tab=retencion&periodo=custom&desde=2025-01-01&hasta=2026-06-30');
    render(<RetentionView token="t" isAdmin />);
    expect(await screen.findByText(/caben como mucho 12 meses/)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('una cifra abre su lista: mismas filas que la cifra, WhatsApp y teléfono, y la baja de avisos sin contacto', async () => {
    const user = userEvent.setup();
    render(<RetentionView token="t" isAdmin />);
    await user.click(await screen.findByTestId('retention-open-lost'));
    const dialog = await screen.findByRole('dialog', { name: 'Perdidos' });
    expect(mockedPatients).toHaveBeenCalledWith('t', THIS_YEAR, 'lost', 1, 25);
    const table = await within(dialog).findByRole('table', { name: 'Pacientes: Perdidos' });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // cabecera + 2
    const ana = within(table).getByText('Ana Rondón').closest('tr') as HTMLElement;
    expect(
      within(ana)
        .getByRole('link', { name: /^Escribir a Ana Rondón por WhatsApp/ })
        .getAttribute('href'),
    ).toMatch(/^https:\/\/wa\.me\/584125550101\?text=/);
    const luis = within(table).getByText('Luis Guerra').closest('tr') as HTMLElement;
    expect(within(luis).queryByRole('link', { name: /WhatsApp|Llamar/ })).not.toBeInTheDocument();
    expect(within(luis).getByTestId('retention-opted-out')).toHaveTextContent('No quiere avisos');
    expect(within(dialog).getByTestId('retention-opted-out-why')).toBeInTheDocument();
    expect(within(dialog).getByText(/2 pacientes/)).toBeInTheDocument();
  });

  it('desde la tabla, la lista va con la sede y el profesional de la fila', async () => {
    const user = userEvent.setup();
    render(<RetentionView token="t" isAdmin />);
    await user.click(await screen.findByTestId('retention-cell-loc-1-u-1-newNoReturn'));
    await screen.findByRole('dialog', { name: 'Nuevos sin regreso' });
    expect(mockedPatients).toHaveBeenCalledWith(
      't',
      { ...THIS_YEAR, locationId: 'loc-1', providerId: 'u-1' },
      'new_no_return',
      1,
      25,
    );
  });

  it('«Exportar lista» solo para ADMIN; el CSV del informe, para quien lo ve', async () => {
    const user = userEvent.setup();
    mockedListCsv.mockResolvedValue('a,b');
    mockedCsv.mockResolvedValue('x,y');
    const { unmount } = render(<RetentionView token="t" isAdmin />);
    await user.click(await screen.findByTestId('retention-open-lost'));
    const dialog = await screen.findByRole('dialog', { name: 'Perdidos' });
    await within(dialog).findByRole('table');
    await user.click(within(dialog).getByRole('button', { name: 'Exportar lista' }));
    await waitFor(() => expect(mockedListCsv).toHaveBeenCalledWith('t', THIS_YEAR, 'lost'));
    expect(jest.mocked(saveCsv)).toHaveBeenCalledWith('a,b', 'retencion-lost-2026-01-01-2026-11-16.csv', { bom: true });
    unmount();

    render(<RetentionView token="t" isAdmin={false} />);
    await user.click(await screen.findByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', THIS_YEAR));
    await user.click(screen.getByTestId('retention-open-lost'));
    const other = await screen.findByRole('dialog', { name: 'Perdidos' });
    await within(other).findByRole('table');
    expect(within(other).queryByRole('button', { name: 'Exportar lista' })).not.toBeInTheDocument();
  });

  it('a 390 px las filas son tarjetas y la baja de avisos se lee en la tarjeta', async () => {
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
      const user = userEvent.setup();
      render(<RetentionView token="t" isAdmin />);
      const list = await screen.findByRole('list', { name: 'Retención por sede y profesional' });
      expect(flat(within(list).getByText('Dra. Pérez').closest('li')?.textContent)).toContain('Perdidos 2');
      await user.click(screen.getByTestId('retention-open-lost'));
      const dialog = await screen.findByRole('dialog', { name: 'Perdidos' });
      const cards = await within(dialog).findByRole('list', { name: 'Pacientes: Perdidos' });
      expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
      expect(flat(within(cards).getByText('Luis Guerra').closest('li')?.textContent)).toContain('No quiere avisos');
    } finally {
      window.matchMedia = original;
    }
  });

  it('sin datos: «Sin datos en el periodo»', async () => {
    mockedGet.mockResolvedValue(report({ hasData: false, rows: [], locations: [] }));
    render(<RetentionView token="t" isAdmin />);
    expect(await screen.findByText('Sin datos en el periodo')).toBeInTheDocument();
  });

  it('si falla, el error con «Reintentar» vuelve a pedirlo', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Caída'));
    render(<RetentionView token="t" isAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('retention-figure-lost')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('un 403 sin sede: el aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Sin acceso'));
    render(<RetentionView token="t" isAdmin={false} />);
    expect(await screen.findByText('Tu rol no tiene acceso a la retención de pacientes.')).toBeInTheDocument();
  });
});

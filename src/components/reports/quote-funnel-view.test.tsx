import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuoteFunnelView } from './quote-funnel-view';
import {
  downloadQuoteFunnelCsv,
  getQuoteFunnel,
  getQuoteFunnelPresentations,
  type QuoteFunnelPresentation,
  type QuoteFunnelProfessionalRow,
  type QuoteFunnelReport,
} from '@/lib/reports/quote-funnel-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=presupuestos');
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
jest.mock('../../lib/reports/quote-funnel-api', () => ({
  ...jest.requireActual('../../lib/reports/quote-funnel-api'),
  getQuoteFunnel: jest.fn(),
  getQuoteFunnelPresentations: jest.fn(),
  downloadQuoteFunnelCsv: jest.fn(),
}));
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

const mockedGet = getQuoteFunnel as jest.MockedFunction<typeof getQuoteFunnel>;
const mockedDetail = getQuoteFunnelPresentations as jest.MockedFunction<typeof getQuoteFunnelPresentations>;
const mockedCsv = downloadQuoteFunnelCsv as jest.MockedFunction<typeof downloadQuoteFunnelCsv>;
const mockedSave = saveCsv as jest.MockedFunction<typeof saveCsv>;
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const usd = (n: number) => moneyWithCode(n, 'USD', fmt);
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');
const NOV = { from: '2026-11-01', to: '2026-11-16' };

const ca = (count: number, amount: number | null) => ({ count, amount });

function professional(overrides: Partial<QuoteFunnelProfessionalRow> = {}): QuoteFunnelProfessionalRow {
  return {
    professionalId: 'u-1',
    name: 'Dra. Marisol Rivas',
    presented: ca(8, 2000),
    accepted: ca(3, 600),
    scheduled: ca(1, 200),
    done: ca(1, 150),
    collected: ca(2, 120),
    acceptanceRate: { byCount: 37.5, byAmount: 30 },
    medianDaysToAccept: 2.5,
    ...overrides,
  };
}

function report(overrides: Partial<QuoteFunnelReport> = {}): QuoteFunnelReport {
  return {
    period: NOV,
    currency: 'USD',
    scope: 'CLINIC',
    restrictedToLocations: false,
    filters: { locationId: null, providerId: null },
    steps: [
      { key: 'PRESENTED', count: 10, amount: 2500, rateOfPresented: 100, amountRateOfPresented: 100 },
      { key: 'ACCEPTED', count: 4, amount: 700, rateOfPresented: 40, amountRateOfPresented: 28 },
      { key: 'SCHEDULED', count: 1, amount: 200, rateOfPresented: 10, amountRateOfPresented: 8 },
      { key: 'DONE', count: 1, amount: 150, rateOfPresented: 10, amountRateOfPresented: 6 },
      { key: 'COLLECTED', count: 2, amount: 120, rateOfPresented: 20, amountRateOfPresented: 4.8 },
    ],
    acceptanceRate: { byCount: 40, byAmount: 28 },
    medianDaysToAccept: 1,
    outcomes: { pending: ca(3, 900), rejected: ca(3, 800), cancelled: ca(0, 0) },
    rejectionReasons: [
      { reason: 'FEAR', count: 2, amount: 500 },
      { reason: 'PRICE', count: 1, amount: 300 },
    ],
    byProfessional: [
      professional(),
      professional({
        professionalId: null,
        name: 'Sin atribuir',
        presented: ca(2, 500),
        accepted: ca(1, 100),
        acceptanceRate: { byCount: 50, byAmount: 20 },
      }),
    ],
    withoutRate: { presentations: 0 },
    warnings: [],
    definitions: [
      { key: 'PRESENTED', label: 'Presentados', howItIsCalculated: ['Grupos de opciones presentados en el período.'] },
      { key: 'ACCEPTANCE_RATE', label: 'Tasa de aceptación', howItIsCalculated: ['Aceptados ÷ presentados.'] },
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

function presentation(overrides: Partial<QuoteFunnelPresentation> = {}): QuoteFunnelPresentation {
  return {
    groupId: 'g-1',
    planIds: ['plan-1', 'plan-2'],
    firstPlanId: 'plan-1',
    patientId: 'pat-1',
    patientName: 'Ana Pérez',
    presentedAt: '2026-11-05T15:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Sede Altamira',
    timeZone: 'America/Caracas',
    professionalId: 'u-1',
    professionalName: 'Dra. Marisol Rivas',
    optionCount: 2,
    presentedAmount: 500,
    acceptedAmount: 300,
    scheduledAmount: null,
    doneAmount: null,
    collectedAmount: null,
    outcome: 'ACCEPTED',
    rejectionReason: null,
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

describe('QuoteFunnelView (DX-558)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=presupuestos');
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
    mockedGet.mockResolvedValue(report());
    mockedDetail.mockResolvedValue({ currency: 'USD', items: [presentation()], total: 1, page: 1, pageSize: 25 });
  });

  it('pide este mes de la sede y pinta los pasos en su orden con «n · % · importe», sin reordenar', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(mockedGet).toHaveBeenCalledWith('t', NOV);
    const figure = screen.getByRole('figure', { name: 'Del presupuesto al cobro' });
    const rows = within(figure).getAllByTestId('ranked-bar').map((li) => li.firstElementChild?.textContent);
    // Cobrados (2) va detrás de Realizados (1): el orden es el del embudo.
    expect(rows).toEqual(['Presentados', 'Aceptados', 'Agendados', 'Realizados', 'Cobrados']);
    expect(flat(screen.getByTestId('quote-funnel-step-ACCEPTED').textContent)).toMatch(
      new RegExp(`^4 · 40\\s?% · ${usd(700).replace(/\s/g, ' ').replace(/[.$]/g, '\\$&')}$`),
    );
    // Cada barra, relativa a los presentados.
    const widths = within(figure)
      .getAllByTestId('ranked-bar')
      .map((li) => (li.querySelector('[aria-hidden] > span') as HTMLElement).style.width);
    expect(widths).toEqual(['100%', '40%', '10%', '10%', '20%']);
    expect(flat(screen.getByTestId('quote-funnel-scope').textContent)).toBe(
      'Presupuestos de la clínica · consolidado de tus sedes · Importes en USD',
    );
  });

  it('resumen: tasa por número y por importe, días hasta aceptar y lo no aceptado', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(flat((await screen.findByTestId('quote-funnel-by-count')).textContent)).toMatch(/40\s?%/);
    expect(flat(screen.getByTestId('quote-funnel-by-amount').textContent)).toMatch(/28\s?%/);
    expect(flat(screen.getByTestId('quote-funnel-median').textContent)).toContain('1 día');
    expect(flat(screen.getByTestId('quote-funnel-outcome-pending').textContent)).toContain(usd(900).replace(/\s/g, ' '));
    // Sin cancelados: el 0 no abre nada.
    expect(within(screen.getByTestId('quote-funnel-outcome-cancelled')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('un paso abre sus presentaciones con los mismos filtros y enlaza al plan en la ficha', async () => {
    mockedDetail.mockResolvedValue({
      currency: 'USD',
      items: [presentation(), presentation({ groupId: 'g-2', patientId: null, patientName: null })],
      total: 2,
      page: 1,
      pageSize: 25,
    });
    render(<QuoteFunnelView token="t" isAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /^Aceptados: 4/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Aceptados' });
    expect(mockedDetail).toHaveBeenCalledWith('t', NOV, 'ACCEPTED', null, 1, 25);
    const rows = await within(dialog).findAllByTestId('quote-funnel-presentation');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=treatment-plans&planId=plan-1',
    );
    expect(flat(rows[0].textContent)).toContain(usd(300).replace(/\s/g, ' '));
    expect(within(rows[1]).queryByRole('link')).not.toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Paciente eliminado');
    expect(within(dialog).getByText(/2 presentaciones, de la más reciente/)).toBeInTheDocument();
  });

  it('motivos de rechazo en el orden de la API; cada uno abre los rechazados por ese motivo', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    const figure = await screen.findByRole('figure', { name: 'Motivos de rechazo' });
    expect(within(figure).getAllByTestId('ranked-bar').map((li) => li.firstElementChild?.textContent)).toEqual([
      'Miedo al tratamiento',
      'Precio',
    ]);
    await userEvent.click(within(figure).getByRole('button', { name: /^Precio: 1/ }));
    await screen.findByRole('dialog', { name: 'Rechazados · Precio' });
    expect(mockedDetail).toHaveBeenCalledWith('t', NOV, 'REJECTED', 'PRICE', 1, 25);
  });

  it('por profesional: «Profesional que lo elaboró», sus cifras abren lo suyo y «Sin atribuir» no abre', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    const table = await screen.findByRole('table', { name: 'Embudo de presupuestos por profesional' });
    expect(within(table).getByRole('columnheader', { name: /Profesional que lo elaboró/ })).toBeInTheDocument();
    const unattributed = within(table).getByRole('row', { name: /Sin atribuir/ });
    expect(within(unattributed).queryByRole('button', { name: /Ver/ })).not.toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Dra\. Marisol Rivas/ });
    await userEvent.click(within(row).getByRole('button', { name: /^Cobrados · Dra\. Marisol Rivas: 2/ }));
    await screen.findByRole('dialog', { name: 'Cobrados · Dra. Marisol Rivas' });
    expect(mockedDetail).toHaveBeenCalledWith('t', { ...NOV, providerId: 'u-1' }, 'COLLECTED', null, 1, 25);
  });

  it('a 390 px la tabla por profesional sigue siendo tabla (desplazamiento lateral)', async () => {
    const restore = mockPhone(true);
    try {
      render(<QuoteFunnelView token="t" isAdmin />);
      expect(await screen.findByRole('table', { name: 'Embudo de presupuestos por profesional' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('DENTIST (scope OWN): «Solo tus presupuestos», sin filtro de profesional ni CSV', async () => {
    mockedGet.mockResolvedValue(
      report({ scope: 'OWN', byProfessional: [professional()], filters: { locationId: null, providerId: 'u-1' } }),
    );
    render(<QuoteFunnelView token="t" isAdmin={false} />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(screen.getByTestId('quote-funnel-scope')).toHaveTextContent('Solo tus presupuestos');
    expect(screen.queryByLabelText('Profesional que lo elaboró', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('DENTIST con un «?profesional=» copiado de otra persona: no lo manda (la API daría 403)', async () => {
    search = new URLSearchParams('tab=presupuestos&profesional=u-otro');
    mockedGet.mockResolvedValue(report({ scope: 'OWN', byProfessional: [professional()] }));
    render(<QuoteFunnelView token="t" isAdmin={false} ownByRole />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(mockedGet).toHaveBeenCalledWith('t', NOV);
    expect(mockedGet).not.toHaveBeenCalledWith('t', expect.objectContaining({ providerId: 'u-otro' }));
  });

  it('sin tasa: aviso con el número de presentaciones fuera de los importes', async () => {
    mockedGet.mockResolvedValue(report({ warnings: ['WITHOUT_RATE'], withoutRate: { presentations: 2 } }));
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(await screen.findByTestId('quote-funnel-without-rate')).toHaveTextContent(
      '2 presentaciones tienen procedimientos en otra moneda sin tasa guardada',
    );
  });

  it('sin moneda de catálogo: aviso y los importes en «—»; los números siguen', async () => {
    mockedGet.mockResolvedValue(
      report({
        currency: null,
        warnings: ['NO_CATALOG_CURRENCY'],
        steps: report().steps.map((s) => ({ ...s, amount: null, amountRateOfPresented: null })),
        acceptanceRate: { byCount: 40, byAmount: null },
      }),
    );
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(await screen.findByTestId('quote-funnel-no-currency')).toBeInTheDocument();
    expect(flat(screen.getByTestId('quote-funnel-step-ACCEPTED').textContent)).toMatch(/^4 · 40\s?% · —$/);
    expect(flat(screen.getByTestId('quote-funnel-by-amount').textContent)).toContain('—');
    expect(screen.getByTestId('quote-funnel-scope')).not.toHaveTextContent('Importes en');
  });

  it('miembro restringido: «Solo incluye tus sedes.»', async () => {
    mockedGet.mockResolvedValue(report({ restrictedToLocations: true }));
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(await screen.findByTestId('quote-funnel-restricted')).toHaveTextContent('Solo incluye tus sedes.');
  });

  it('«Descargar CSV» solo para ADMIN, con los filtros de la URL', async () => {
    mockedCsv.mockResolvedValue('a,b');
    search = new URLSearchParams(
      'tab=presupuestos&periodo=custom&desde=2026-10-01&hasta=2026-10-31&sede=loc-1&profesional=u-1',
    );
    const filters = { from: '2026-10-01', to: '2026-10-31', locationId: 'loc-1', providerId: 'u-1' };
    const { unmount } = render(<QuoteFunnelView token="t" isAdmin />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(mockedGet).toHaveBeenCalledWith('t', filters);
    expect(screen.getByTestId('quote-funnel-scope')).toHaveTextContent('sede Sede Altamira');
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', filters));
    expect(mockedSave).toHaveBeenCalledWith('a,b', 'embudo-de-presupuestos-2026-10-01-2026-10-31.csv', { bom: true });
    unmount();

    render(<QuoteFunnelView token="t" isAdmin={false} />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('los filtros se escriben en la URL conservando la pestaña', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    await userEvent.selectOptions(screen.getByLabelText('Sede donde se presentó', { exact: true }), 'loc-2');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=presupuestos&sede=loc-2', { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText('Profesional que lo elaboró', { exact: true }), 'u-1');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=presupuestos&profesional=u-1', { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText('Período', { exact: true }), 'custom');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=presupuestos&periodo=custom&desde=2026-11-01&hasta=2026-11-16', {
      scroll: false,
    });
  });

  it('«Cómo se calcula» con las definiciones de la API', async () => {
    render(<QuoteFunnelView token="t" isAdmin />);
    const how = await screen.findByTestId('quote-funnel-how');
    await userEvent.click(within(how).getByRole('button', { name: /Cómo se calcula/ }));
    expect(how).toHaveTextContent('Grupos de opciones presentados en el período.');
    expect(how).toHaveTextContent('Aceptados ÷ presentados.');
  });

  it('sin presentaciones: el vacío', async () => {
    mockedGet.mockResolvedValue(
      report({ steps: report().steps.map((s) => ({ ...s, count: 0, rateOfPresented: null })), byProfessional: [] }),
    );
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(await screen.findByText('Sin presupuestos presentados en el período')).toBeInTheDocument();
    expect(screen.queryByTestId('quote-funnel-step-PRESENTED')).not.toBeInTheDocument();
  });

  it('cargando: esqueleto con nombre', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(screen.getByRole('status', { name: 'Cargando el embudo de presupuestos' })).toBeInTheDocument();
  });

  it('error: escalón de sección con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    render(<QuoteFunnelView token="t" isAdmin />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el embudo de presupuestos.');
    await userEvent.click(within(alert).getByRole('button'));
    await screen.findByTestId('quote-funnel-step-PRESENTED');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin filtros: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<QuoteFunnelView token="t" isAdmin={false} />);
    expect(await screen.findByText('Tu rol no tiene acceso al embudo de presupuestos.')).toBeInTheDocument();
  });

  it('409 LOCATION_TIMEZONE_REQUIRED: falta la zona de la sede, con reintento', async () => {
    const message = 'Configura la zona horaria de la sede.';
    mockedGet.mockRejectedValueOnce(
      new ApiError(409, message, { messages: [message], code: 'LOCATION_TIMEZONE_REQUIRED', locationId: 'loc-1' }),
    );
    render(<QuoteFunnelView token="t" isAdmin />);
    expect(await screen.findByText('Falta un dato de la sede')).toBeInTheDocument();
    expect(screen.queryByTestId('quote-funnel-step-PRESENTED')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('quote-funnel-step-PRESENTED');
  });
});

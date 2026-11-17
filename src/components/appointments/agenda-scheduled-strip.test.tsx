import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaScheduledStrip } from './agenda-scheduled-strip';
import { getScheduledProduction, type ScheduledProductionReport } from '@/lib/reports/scheduled-production-api';
import { ApiError } from '@/lib/api/client';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';

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
}));

const mockedGet = getScheduledProduction as jest.MockedFunction<typeof getScheduledProduction>;
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function report(overrides: Partial<ScheduledProductionReport> = {}): ScheduledProductionReport {
  return {
    period: { from: '2026-11-18', to: '2026-11-18' },
    currency: 'USD',
    scope: 'CLINIC',
    restrictedToLocations: false,
    filters: { locationId: null, providerId: null },
    totals: { scheduledAmount: 150, appointments: 4, appointmentsWithoutItems: 2 },
    byDay: [{ date: '2026-11-18', scheduledAmount: 150, appointments: 4, appointmentsWithoutItems: 2 }],
    byProfessional: [
      { professionalId: 'u-1', name: 'Dra. Marisol Rivas', scheduledAmount: 100, appointments: 2, appointmentsWithoutItems: 0 },
      { professionalId: 'u-2', name: 'Dr. Andrés Mora', scheduledAmount: 50, appointments: 2, appointmentsWithoutItems: 2 },
    ],
    byDayAndProfessional: [],
    forecast: { month: '2026-11', today: '2026-11-17', producedToDate: 0, scheduledPending: 150, forecast: 150, itemsWithoutRate: 0 },
    withoutRate: { appointments: 0, items: 0 },
    unattributedDone: 0,
    warnings: [],
    definitions: [],
    options: { locations: [], professionals: [] },
    ...overrides,
  };
}

const props = {
  token: 't',
  from: '2026-11-18',
  to: '2026-11-18',
  rangeLabel: 'del miércoles 18 de noviembre',
  fmt,
};

describe('AgendaScheduledStrip (DX-567)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pide el rango con la sede y pinta el importe de cada profesional', async () => {
    mockedGet.mockResolvedValue(report());
    render(<AgendaScheduledStrip {...props} locationId="loc-1" />);
    const strip = await screen.findByRole('region', { name: 'Agendado del miércoles 18 de noviembre' });
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-18', to: '2026-11-18', locationId: 'loc-1' });
    const rows = screen.getAllByTestId('agenda-scheduled-row').map((li) => flat(li.textContent));
    expect(rows).toEqual([
      `Dra. Marisol Rivas${flat(moneyWithCode(100, 'USD', fmt))}`,
      `Dr. Andrés Mora${flat(moneyWithCode(50, 'USD', fmt))}`,
    ]);
    expect(strip).toBeInTheDocument();
  });

  it('«N sin tratamiento ligado» enlaza a «Previsión» con el mismo rango y sede', async () => {
    mockedGet.mockResolvedValue(report());
    render(<AgendaScheduledStrip {...props} locationId="loc-1" />);
    const link = await screen.findByRole('link', { name: '2 sin tratamiento ligado · ver en Reportes' });
    expect(link).toHaveTextContent('2 sin tratamiento ligado');
    expect(link).toHaveAttribute(
      'href',
      '/reportes?tab=prevision&periodo=custom&desde=2026-11-18&hasta=2026-11-18&sede=loc-1',
    );
  });

  it('sin citas que cuenten no pinta nada', async () => {
    mockedGet.mockResolvedValue(report({ totals: { scheduledAmount: 0, appointments: 0, appointmentsWithoutItems: 0 }, byProfessional: [] }));
    const { container } = render(<AgendaScheduledStrip {...props} />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('sin moneda de catálogo: «—» en los importes', async () => {
    mockedGet.mockResolvedValue(
      report({
        currency: null,
        byProfessional: [{ professionalId: 'u-1', name: 'Dra. Marisol Rivas', scheduledAmount: null, appointments: 1, appointmentsWithoutItems: 0 }],
      }),
    );
    render(<AgendaScheduledStrip {...props} />);
    expect(await screen.findByTestId('agenda-scheduled-row')).toHaveTextContent('Dra. Marisol Rivas—');
  });

  it('si falla, un aviso pequeño con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(report());
    render(<AgendaScheduledStrip {...props} />);
    expect(await screen.findByText('Agendado sin cargar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar lo agendado' }));
    expect(await screen.findByTestId('agenda-scheduled-strip')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('un 403 la oculta sin aviso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'No'));
    const { container } = render(<AgendaScheduledStrip {...props} />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('otro refreshKey vuelve a pedir', async () => {
    mockedGet.mockResolvedValue(report());
    const { rerender } = render(<AgendaScheduledStrip {...props} refreshKey="a" />);
    await screen.findByTestId('agenda-scheduled-strip');
    rerender(<AgendaScheduledStrip {...props} refreshKey="b" />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });
});

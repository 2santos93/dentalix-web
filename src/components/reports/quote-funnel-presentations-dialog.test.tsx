import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuoteFunnelPresentationsDialog } from './quote-funnel-presentations-dialog';
import { getQuoteFunnelPresentations, type QuoteFunnelPresentation } from '@/lib/reports/quote-funnel-api';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/reports/quote-funnel-api', () => ({
  ...jest.requireActual('../../lib/reports/quote-funnel-api'),
  getQuoteFunnelPresentations: jest.fn(),
}));

const mocked = getQuoteFunnelPresentations as jest.MockedFunction<typeof getQuoteFunnelPresentations>;
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const FILTERS = { from: '2026-11-01', to: '2026-11-30', locationId: 'loc-1' };

function item(i: number, overrides: Partial<QuoteFunnelPresentation> = {}): QuoteFunnelPresentation {
  return {
    groupId: `g-${i}`,
    planIds: [`plan-${i}`],
    firstPlanId: `plan-${i}`,
    patientId: `pat-${i}`,
    patientName: `Paciente ${i}`,
    presentedAt: '2026-11-05T15:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Sede Altamira',
    timeZone: 'America/Caracas',
    professionalId: null,
    professionalName: null,
    optionCount: 1,
    presentedAmount: 100,
    acceptedAmount: null,
    scheduledAmount: null,
    doneAmount: null,
    collectedAmount: null,
    outcome: 'REJECTED',
    rejectionReason: 'SECOND_OPINION',
    ...overrides,
  };
}

describe('QuoteFunnelPresentationsDialog (DX-558)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pagina de 25 en 25 con los mismos filtros; desenlace con motivo y «Sin atribuir»', async () => {
    mocked.mockImplementation((_t, _f, _s, _r, page) =>
      Promise.resolve({
        currency: 'USD',
        items: Array.from({ length: page === 1 ? 25 : 5 }, (_, i) => item((page - 1) * 25 + i)),
        total: 30,
        page,
        pageSize: 25,
      }),
    );
    render(
      <QuoteFunnelPresentationsDialog
        token="t"
        filters={FILTERS}
        opened={{ step: 'REJECTED', reason: 'SECOND_OPINION', title: 'Rechazados · Segunda opinión', count: 30 }}
        fmt={fmt}
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rechazados · Segunda opinión' });
    expect(await within(dialog).findAllByTestId('quote-funnel-presentation')).toHaveLength(25);
    expect(mocked).toHaveBeenLastCalledWith('t', FILTERS, 'REJECTED', 'SECOND_OPINION', 1, 25);
    const first = within(dialog).getAllByTestId('quote-funnel-presentation')[0];
    expect(first).toHaveTextContent('Rechazado · Quiere una segunda opinión');
    expect(first).toHaveTextContent('Sin atribuir');
    await userEvent.click(within(dialog).getByRole('button', { name: /siguiente/i }));
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith('t', FILTERS, 'REJECTED', 'SECOND_OPINION', 2, 25));
    expect(await within(dialog).findAllByTestId('quote-funnel-presentation')).toHaveLength(5);
  });

  it('sin moneda de catálogo, los importes en «—»; un error se reintenta', async () => {
    mocked.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({
      currency: null,
      items: [item(1, { presentedAmount: null, outcome: 'PENDING', rejectionReason: null })],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    render(
      <QuoteFunnelPresentationsDialog
        token="t"
        filters={FILTERS}
        opened={{ step: 'PENDING', title: 'Pendientes', count: 1 }}
        fmt={fmt}
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Pendientes' });
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar las presentaciones de esta cifra.');
    await userEvent.click(within(alert).getByRole('button'));
    const row = await within(dialog).findByTestId('quote-funnel-presentation');
    expect(row).toHaveTextContent('—');
    expect(row).toHaveTextContent('Pendiente');
    expect(within(row).getByRole('link', { name: 'Paciente 1' })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=treatment-plans&planId=plan-1',
    );
  });
});

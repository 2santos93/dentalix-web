import { render, screen, within } from '@testing-library/react';
import { PeriodResultsSection } from './period-results-section';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
import { getLocationsComparison } from '@/lib/reports/reports-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { moneyWithCode } from '@/lib/format/sede-number';
import { STAMP_FORMATS } from '@/lib/test/stamp';
import type { DashboardCurrency } from '@/lib/locations/sede-regional-summary';

// jest.mock no reescribe alias: rutas relativas (convención del repo).
jest.mock('../../lib/dashboard/dashboard-api', () => ({ getDashboard: jest.fn() }));
jest.mock('../../lib/reports/reports-api', () => ({ getLocationsComparison: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

function dashboard(currency: string, total: number): Dashboard {
  return {
    period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-04T00:00:00.000Z' },
    incomes: {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-04T00:00:00.000Z',
      currency,
      totalConverted: total,
      count: 3,
      byCurrency: { [currency]: total },
    },
    lowStockItems: { count: 0, items: [] },
    upcomingAppointments: [],
    patientCount: 10,
  } as Dashboard;
}

function ready(currency: string): Extract<DashboardCurrency, { status: 'ready' }> {
  return { status: 'ready', currency, source: 'sede', defaultCurrency: currency, scope: 'sede', choose: jest.fn(), reset: jest.fn() } as never;
}

describe('PeriodResultsSection: lo cobrado con el formato de la sede (DX-354b)', () => {
  beforeEach(() => {
    jest.mocked(listCurrencies).mockResolvedValue([
      { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
    ] as never);
    jest.mocked(getLocationsComparison).mockReturnValue(new Promise(() => undefined));
  });

  it.each([
    ['caracas', 'es-VE', 'h12', 'VES', 'VES 1.234,50'],
    ['berlin', 'de-DE', 'h23', 'EUR', '1.234,50 EUR'],
    ['miami', 'en-US', 'h12', 'VES', 'VES 1,234.50'],
  ] as const)('con la sede de %s (%s) el total cobrado sale «%s» (%s)', async (key, _locale, _clock, currency, expected) => {
    jest.mocked(getDashboard).mockResolvedValue(dashboard(currency, 1234.5));
    render(
      <PeriodResultsSection
        token="tok"
        timeZone="America/Caracas"
        scopeKey="loc-1"
        currency={ready(currency)}
        fmt={STAMP_FORMATS[key]}
      />,
    );
    const incomes = await screen.findByTestId('dashboard-incomes');
    await within(incomes).findByText(/Cobrado, en/);
    expect(norm(incomes.textContent)).toContain(norm(moneyWithCode(1234.5, currency, STAMP_FORMATS[key])));
    expect(norm(incomes.textContent)).toContain(expected);
  });

  it('sin formato de la sede el total sale «—», nunca con otro formato', async () => {
    jest.mocked(getDashboard).mockResolvedValue(dashboard('VES', 1234.5));
    render(
      <PeriodResultsSection token="tok" timeZone="America/Caracas" scopeKey="loc-1" currency={ready('VES')} fmt={null} />,
    );
    const incomes = await screen.findByTestId('dashboard-incomes');
    await within(incomes).findByText('—', { selector: 'dd' });
    expect(norm(incomes.textContent)).not.toMatch(/1[.,]234/);
  });

  it('sin formato de la sede el subtítulo del período dice «—», no el día ISO crudo', async () => {
    jest.mocked(getDashboard).mockResolvedValue(dashboard('VES', 1234.5));
    render(
      <PeriodResultsSection token="tok" timeZone="America/Caracas" scopeKey="loc-1" currency={ready('VES')} fmt={null} />,
    );
    await screen.findByTestId('dashboard-incomes');
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

import {
  basisFromParam,
  BASIS_PARAM,
  currencyOf,
  expenseCategories,
  getProfitabilityLines,
  profitabilityCurrencies,
  type ProfitabilityReport,
} from './profitability-api';
import { apiFetch } from '@/lib/api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchText: jest.fn() }));

const row = (currencies: ProfitabilityReport['total']['currencies']) => ({
  locationId: null,
  name: 'Total del grupo',
  isActive: true,
  timeZone: null,
  currencies,
});
const money = (currency: string, categories: string[]) => ({
  currency,
  income: 0,
  incomeCount: 0,
  expenses: 0,
  expenseCount: 0,
  net: 0,
  margin: null,
  categories: categories.map((category) => ({ category, amount: 1, count: 1 })),
});

describe('profitability-api (DX-410)', () => {
  it('la base viaja en la URL como «caja» o «devengo» (por defecto, caja)', () => {
    expect(BASIS_PARAM).toEqual({ CASH: 'caja', ACCRUAL: 'devengo' });
    expect(basisFromParam('devengo')).toBe('ACCRUAL');
    expect(basisFromParam('caja')).toBe('CASH');
    expect(basisFromParam(null)).toBe('CASH');
    expect(basisFromParam('otra')).toBe('CASH');
  });

  it('monedas, moneda de una fila y categorías salen del total del grupo', () => {
    const total = row([money('USD', ['Laboratorio', 'Alquiler']), money('VES', [])]);
    const report = { total } as unknown as ProfitabilityReport;
    expect(profitabilityCurrencies(report)).toEqual(['USD', 'VES']);
    expect(currencyOf(total, 'VES')?.currency).toBe('VES');
    expect(currencyOf(total, 'EUR')).toBeNull();
    expect(expenseCategories(report, 'USD')).toEqual(['Laboratorio', 'Alquiler']);
    expect(expenseCategories(report, 'EUR')).toEqual([]);
  });

  it('el detalle manda los filtros del informe, la cifra y la página', async () => {
    jest.mocked(apiFetch).mockResolvedValue({});
    await getProfitabilityLines(
      't',
      { from: '2026-10-01', to: '2026-10-31', basis: 'ACCRUAL', locationId: 'ignorada' },
      { side: 'EXPENSE', currency: 'USD', locationId: 'loc-1', category: 'Laboratorio' },
      2,
      25,
    );
    expect(apiFetch).toHaveBeenCalledWith(
      '/reports/profitability/lines?from=2026-10-01&to=2026-10-31&basis=ACCRUAL&locationId=loc-1&side=EXPENSE&currency=USD&category=Laboratorio&page=2&pageSize=25',
      { token: 't' },
    );
    await getProfitabilityLines('t', { from: '2026-10-01', to: '2026-10-31', basis: 'CASH' }, { side: 'INCOME', currency: 'VES' }, 1, 25);
    expect(jest.mocked(apiFetch).mock.calls[1][0]).toBe(
      '/reports/profitability/lines?from=2026-10-01&to=2026-10-31&basis=CASH&side=INCOME&currency=VES&page=1&pageSize=25',
    );
    // El total de un informe filtrado a una sede es el de esa sede.
    await getProfitabilityLines('t', { from: '2026-10-01', to: '2026-10-31', basis: 'CASH', locationId: 'loc-2' }, { side: 'INCOME', currency: 'VES' }, 1, 25);
    expect(jest.mocked(apiFetch).mock.calls[2][0]).toContain('&locationId=loc-2&');
  });
});

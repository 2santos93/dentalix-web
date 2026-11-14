import {
  comparisonCurrencies,
  formatChange,
  formatMetric,
  locationAmounts,
  metricValues,
  nextSort,
  sortCurrency,
  sortRows,
  type SortState,
} from './comparison-table';
import { regionalFormat } from '@/lib/format/regional-format';
import type { ComparisonRow, LocationsComparison, Metric } from './reports-api';

const metric = (value: number | null): Metric => ({ value, previous: null, change: null, trend: null });

function row(name: string, production: number | null, noShow: number | null): ComparisonRow {
  const money = production === null ? [] : [{ currency: 'VES', ...metric(production) }];
  return {
    locationId: name,
    name,
    isActive: true,
    timeZone: 'America/Caracas',
    hasActivity: true,
    previousPeriodUnattributed: false,
    metrics: {
      production: money,
      collected: money,
      collectionRate: money,
      completedAppointments: metric(1),
      noShowRate: metric(noShow),
      newPatients: metric(0),
      averageTicket: money,
      occupancy: metric(null),
    },
  };
}

const report = {
  locations: [row('Norte', 300, 10), row('Centro', 100, null), row('Sur', null, 5)],
  total: row('Total clínica', 400, 8),
} as unknown as LocationsComparison;

const names = (sort: SortState) => sortRows(report, sort).map((r) => r.name);

describe('tabla de «Comparar sedes» (DX-014)', () => {
  it('sin orden, el de la API', () => {
    expect(sortRows(report, null).map((r) => r.name)).toEqual(['Norte', 'Centro', 'Sur']);
    expect(nextSort(null, 'production')).toEqual({ key: 'production', direction: 'descending' });
  });

  it('ordena por nombre en los dos sentidos', () => {
    expect(names({ key: 'name', direction: 'ascending' })).toEqual(['Centro', 'Norte', 'Sur']);
    expect(names({ key: 'name', direction: 'descending' })).toEqual(['Sur', 'Norte', 'Centro']);
  });

  it('ordena una columna de dinero por la moneda del total; sin valor, al final', () => {
    expect(names({ key: 'production', direction: 'descending' })).toEqual(['Norte', 'Centro', 'Sur']);
    expect(names({ key: 'production', direction: 'ascending' })).toEqual(['Centro', 'Norte', 'Sur']);
  });

  it('ordena porcentajes; null al final en los dos sentidos', () => {
    expect(names({ key: 'noShowRate', direction: 'ascending' })).toEqual(['Sur', 'Norte', 'Centro']);
    expect(names({ key: 'noShowRate', direction: 'descending' })).toEqual(['Norte', 'Sur', 'Centro']);
  });

  it('pulsar la misma cabecera invierte; otra empieza de mayor a menor', () => {
    expect(nextSort({ key: 'name', direction: 'ascending' }, 'name')).toEqual({ key: 'name', direction: 'descending' });
    expect(nextSort({ key: 'name', direction: 'ascending' }, 'collected')).toEqual({
      key: 'collected',
      direction: 'descending',
    });
  });

  it('formatea valores y variaciones', () => {
    const co = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
    expect(formatMetric('PERCENT', 33.33, co)).toBe('33,33%');
    expect(formatMetric('COUNT', 1234, co)).toBe('1.234');
    expect(formatMetric('PERCENT', null, co)).toBe('—');
    // DX-378: el código de la moneda, nunca «$» (producto bimonetario).
    expect(formatMetric('MONEY', 120000, co, 'VES')).toBe('VES\u00a0120.000,00');
    expect(formatMetric('MONEY', 120000, co, 'USD')).toBe('USD\u00a0120.000,00');
    // Sin moneda: el importe sin símbolo, sin espacio delante.
    expect(formatMetric('MONEY', 120000, co)).toBe('120.000,00');
    expect(formatChange(20, 'PERCENT', co)).toBe('+20%');
    expect(formatChange(-2.25, 'PERCENT', co)).toBe('−2,3%');
    expect(formatChange(0, 'PERCENT', co)).toBe('0%');
    // Los indicadores que ya son un % varían en puntos porcentuales.
    expect(formatChange(2, 'POINTS', co)).toBe('+2 p.p.');
    expect(formatChange(-1.25, 'POINTS', co)).toBe('−1,3 p.p.');
    expect(formatChange(0, 'POINTS', co)).toBe('0 p.p.');
  });

  it('DX-378 (FE-078): con una sede en en-US, sus separadores, no los de «es»', () => {
    const us = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
    expect(formatMetric('COUNT', 1234, us)).toBe('1,234');
    expect(formatMetric('PERCENT', 33.33, us)).toBe('33.33%');
    expect(formatMetric('MONEY', 120000, us)).toBe('120,000.00');
    expect(formatChange(-2.25, 'PERCENT', us)).toBe('−2.3%');
    expect(formatChange(-1.25, 'POINTS', us)).toBe('−1.3 p.p.');
  });
});

describe('metricValues (BE-042)', () => {
  it('la ocupación nunca pasa del 100 % en pantalla', () => {
    const r = row('Norte', 1, 1);
    expect(metricValues({ ...r, metrics: { ...r.metrics, occupancy: metric(300) } }, 'occupancy')[0].value).toBe(100);
    expect(metricValues({ ...r, metrics: { ...r.metrics, occupancy: metric(66.67) } }, 'occupancy')[0].value).toBe(66.67);
    expect(metricValues({ ...r, metrics: { ...r.metrics, occupancy: metric(null) } }, 'occupancy')[0].value).toBeNull();
  });
});

/** Una fila con importes en las monedas dadas (producción y cobrado iguales). */
function multi(name: string, amounts: Record<string, number>): ComparisonRow {
  const money = Object.entries(amounts).map(([currency, value]) => ({ currency, ...metric(value) }));
  const base = row(name, null, null);
  return { ...base, metrics: { ...base.metrics, production: money, collected: money } };
}

describe('moneda elegida para ordenar y graficar (DX-526)', () => {
  const demo = {
    locations: [
      multi('Sede principal', { USD: 100, VES: 5000 }),
      multi('Sede Norte', { USD: 300, VES: 100 }),
      multi('Sede São Paulo', { BRL: 900 }),
      multi('Sede Londres', { GBP: 50 }),
    ],
    total: multi('Total clínica', { USD: 400, BRL: 900, GBP: 50, VES: 5100 }),
  } as unknown as LocationsComparison;
  const order = (sort: SortState, currency?: string | null) => sortRows(demo, sort, currency).map((r) => r.name);

  it('las monedas elegibles son las del total, sin repetir y en su orden', () => {
    expect(comparisonCurrencies(demo)).toEqual(['USD', 'BRL', 'GBP', 'VES']);
  });

  it('sin moneda elegida, la primera del total; una elegida que el total no tiene, también', () => {
    expect(sortCurrency(demo, 'collected')).toBe('USD');
    expect(sortCurrency(demo, 'collected', 'BRL')).toBe('BRL');
    expect(sortCurrency(demo, 'collected', 'EUR')).toBe('USD');
    expect(sortCurrency(demo, 'noShowRate', 'BRL')).toBeNull();
  });

  it('en USD las dos sedes USD se invierten y las demás van al final en los dos sentidos', () => {
    expect(order({ key: 'collected', direction: 'descending' })).toEqual([
      'Sede Norte', 'Sede principal', 'Sede Londres', 'Sede São Paulo',
    ]);
    expect(order({ key: 'collected', direction: 'ascending' })).toEqual([
      'Sede principal', 'Sede Norte', 'Sede Londres', 'Sede São Paulo',
    ]);
  });

  it('en VES se ordena por bolívares; en BRL, la de Brasil primero', () => {
    expect(order({ key: 'collected', direction: 'descending' }, 'VES')[0]).toBe('Sede principal');
    expect(order({ key: 'collected', direction: 'descending' }, 'BRL')[0]).toBe('Sede São Paulo');
  });

  it('locationAmounts: una sede sin importe en la moneda es null, nunca 0', () => {
    expect(locationAmounts(demo, 'production', 'BRL').map((a) => [a.row.name, a.value])).toEqual([
      ['Sede principal', null],
      ['Sede Norte', null],
      ['Sede São Paulo', 900],
      ['Sede Londres', null],
    ]);
    const zero = { ...demo, locations: [multi('A', { BRL: 0 })] } as unknown as LocationsComparison;
    expect(locationAmounts(zero, 'production', 'BRL')[0].value).toBeNull();
  });
});

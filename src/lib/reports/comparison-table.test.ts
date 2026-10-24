import { formatChange, formatMetric, nextSort, sortRows, type SortState } from './comparison-table';
import type { ComparisonRow, LocationsComparison, Metric } from './reports-api';

const metric = (value: number | null): Metric => ({ value, previous: null, changePercent: null, trend: null });

function row(name: string, production: number | null, noShow: number | null): ComparisonRow {
  const money = production === null ? [] : [{ currency: 'COP', ...metric(production) }];
  return {
    locationId: name,
    name,
    isActive: true,
    timeZone: 'America/Bogota',
    hasActivity: true,
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
    expect(formatMetric('PERCENT', 33.33)).toBe('33,33 %');
    expect(formatMetric('COUNT', 1234)).toBe('1234');
    expect(formatMetric('PERCENT', null)).toBe('—');
    expect(formatMetric('MONEY', 120000, 'COP')).toMatch(/120\.000,00/);
    expect(formatChange(20)).toBe('+20 %');
    expect(formatChange(-2.25)).toBe('−2,3 %');
    expect(formatChange(0)).toBe('0 %');
  });
});

import { formatChange, formatMetric, metricValues, nextSort, sortRows, type SortState } from './comparison-table';
import type { ComparisonRow, LocationsComparison, Metric } from './reports-api';

const metric = (value: number | null): Metric => ({ value, previous: null, change: null, trend: null });

function row(name: string, production: number | null, noShow: number | null): ComparisonRow {
  const money = production === null ? [] : [{ currency: 'COP', ...metric(production) }];
  return {
    locationId: name,
    name,
    isActive: true,
    timeZone: 'America/Bogota',
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
    expect(formatMetric('PERCENT', 33.33)).toBe('33,33 %');
    expect(formatMetric('COUNT', 1234)).toBe('1234');
    expect(formatMetric('PERCENT', null)).toBe('—');
    expect(formatMetric('MONEY', 120000, 'COP')).toMatch(/120\.000,00/);
    // Sin moneda: el importe sin símbolo, sin espacio delante.
    expect(formatMetric('MONEY', 120000)).toBe('120.000,00');
    expect(formatChange(20, 'PERCENT')).toBe('+20 %');
    expect(formatChange(-2.25, 'PERCENT')).toBe('−2,3 %');
    expect(formatChange(0, 'PERCENT')).toBe('0 %');
    // Los indicadores que ya son un % varían en puntos porcentuales.
    expect(formatChange(2, 'POINTS')).toBe('+2 p.p.');
    expect(formatChange(-1.25, 'POINTS')).toBe('−1,3 p.p.');
    expect(formatChange(0, 'POINTS')).toBe('0 p.p.');
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

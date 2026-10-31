import { productionLines, UNCATEGORIZED } from './production-table';
import type { ProductionByProcedure } from './reports-api';

const row = (over: Partial<ProductionByProcedure['rows'][number]>): ProductionByProcedure['rows'][number] => ({
  catalogItemId: 'c1',
  code: 'RES-1',
  label: 'Resina',
  category: 'Operatoria',
  currency: 'COP',
  count: 3,
  gross: 280,
  discounts: 20,
  net: 260,
  averageNet: 86.67,
  catalogAverage: 100,
  catalogCount: 3,
  differencePercent: -13.3,
  ...over,
});

const report = {
  rows: [
    row({}),
    row({ currency: 'USD', count: 1, gross: 50, discounts: 0, net: 50, averageNet: 50 }),
    row({ catalogItemId: 'c3', code: 'BLQ', label: 'Blanqueamiento', category: null, count: 1, gross: 30, net: 30 }),
  ],
  categoryTotals: [
    { category: 'Operatoria', currency: 'COP', count: 3, gross: 280, discounts: 20, net: 260, averageNet: 86.67 },
    { category: 'Operatoria', currency: 'USD', count: 1, gross: 50, discounts: 0, net: 50, averageNet: 50 },
    { category: null, currency: 'COP', count: 1, gross: 30, discounts: 0, net: 30, averageNet: 30 },
  ],
  totals: [
    { currency: 'COP', count: 4, gross: 310, discounts: 20, net: 290, averageNet: 72.5 },
    { currency: 'USD', count: 1, gross: 50, discounts: 0, net: 50, averageNet: 50 },
  ],
  unattributed: [{ currency: 'COP', count: 2, gross: 95, discounts: 0, net: 95 }],
} as unknown as ProductionByProcedure;

describe('productionLines (DX-423)', () => {
  it('cada categoría con sus filas y su subtotal por moneda; después los totales y «Sin atribuir», como el CSV', () => {
    expect(productionLines(report).map((l) => `${l.kind}:${l.category ?? ''}:${l.currency}`)).toEqual([
      'category:Operatoria:',
      'procedure:Operatoria:COP',
      'procedure:Operatoria:USD',
      'subtotal:Operatoria:COP',
      'subtotal:Operatoria:USD',
      `category:${UNCATEGORIZED}:`,
      `procedure:${UNCATEGORIZED}:COP`,
      `subtotal:${UNCATEGORIZED}:COP`,
      'total::COP',
      'total::USD',
      'unattributed::COP',
    ]);
  });

  it('sin filas: nada', () => {
    expect(
      productionLines({ ...report, rows: [], categoryTotals: [], totals: [], unattributed: [] }),
    ).toEqual([]);
  });
});

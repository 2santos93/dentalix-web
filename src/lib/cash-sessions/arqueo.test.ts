import {
  countRows,
  countsPayload,
  hasDifference,
  invalidRows,
  parseCounted,
  rowDifference,
} from './arqueo';
import type { CashExpectedLine } from './cash-sessions-api';

const line = (method: CashExpectedLine['method'], expected: number): CashExpectedLine => ({
  currency: 'COP',
  method,
  opening: method === 'CASH' ? 50_000 : 0,
  payments: expected,
  paymentsCount: 1,
  adjustments: 0,
  expected,
});

describe('arqueo en pantalla (DX-027)', () => {
  it('con el esperado a la vista: una fila por par esperado', () => {
    expect(countRows([line('CASH', 80_000), line('CARD', 25_000)], ['COP'])).toEqual([
      { currency: 'COP', method: 'CASH', expected: 80_000, counted: '' },
      { currency: 'COP', method: 'CARD', expected: 25_000, counted: '' },
    ]);
  });

  it('con arqueo ciego: los cuatro métodos de cada moneda, sin esperado', () => {
    const rows = countRows(null, ['USD', 'COP', 'COP']);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ currency: 'COP', method: 'CASH', expected: null, counted: '' });
    expect(rows.every((r) => r.expected === null)).toBe(true);
  });

  it('lee importes con punto o coma y como mucho 2 decimales', () => {
    expect(parseCounted('1500,5')).toBe(1500.5);
    expect(parseCounted(' 80000 ')).toBe(80_000);
    expect(parseCounted('-1')).toBeNull();
    expect(parseCounted('1.005')).toBeNull();
    expect(parseCounted('abc')).toBeNull();
  });

  it('diferencia en vivo sin errores de coma flotante; lo vacío cuenta como 0', () => {
    const row = { currency: 'COP', method: 'CASH' as const, expected: 0.3, counted: '0.1' };
    expect(rowDifference(row)).toBe(-0.2);
    expect(rowDifference({ ...row, counted: '' })).toBe(-0.3);
    expect(rowDifference({ ...row, expected: null })).toBeNull();
    expect(hasDifference([{ ...row, counted: '0.30' }])).toBe(false);
    expect(hasDifference([row])).toBe(true);
  });

  it('el cuerpo del cierre lleva solo lo escrito, y se detecta lo que no es un importe', () => {
    const rows = [
      { currency: 'COP', method: 'CASH' as const, expected: 1, counted: '1' },
      { currency: 'COP', method: 'CARD' as const, expected: 0, counted: '' },
      { currency: 'COP', method: 'OTHER' as const, expected: 0, counted: 'x' },
    ];
    expect(countsPayload(rows)).toEqual([{ currency: 'COP', method: 'CASH', counted: 1 }]);
    expect(invalidRows(rows).map((r) => r.method)).toEqual(['OTHER']);
  });
});

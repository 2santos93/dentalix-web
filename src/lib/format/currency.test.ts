import { formatAmount, formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats a valid ISO code', () => {
    // 1234567.5 (not the brief's 1234.5): this Node's ICU/CLDR data applies
    // "min2" grouping to the generic `es` locale — a 4-digit integer part
    // (1234) renders with no thousands separator ("1234,50"), only 5+ digits
    // do. A 7-digit amount reliably exercises real Intl grouping here.
    expect(formatCurrency(1234567.5, 'USD')).toMatch(/1[.,]234/);
  });

  it('siempre pinta dos decimales, también en COP (ICU reciente le da 0)', () => {
    expect(formatCurrency(150000.5, 'COP').replace(/\s/g, ' ')).toMatch(/150\.000,50/);
    expect(formatCurrency(1800000, 'COP').replace(/\s/g, ' ')).toMatch(/1\.800\.000,00/);
  });

  it('does not throw on an invalid code and falls back to "CODE amount"', () => {
    expect(() => formatCurrency(10, 'NOPE')).not.toThrow();
    expect(formatCurrency(10, 'NOPE')).toBe('NOPE 10.00');
  });

  it('does not throw on an empty code', () => {
    expect(() => formatCurrency(10, '')).not.toThrow();
  });
});

describe('formatAmount', () => {
  it('importe sin moneda, con dos decimales fijos', () => {
    expect(formatAmount(80000)).toBe('80.000,00');
    expect(formatAmount(12.5)).toBe('12,50');
  });
});

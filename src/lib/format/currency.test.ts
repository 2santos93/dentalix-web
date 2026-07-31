import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats a valid ISO code', () => {
    // 1234567.5 (not the brief's 1234.5): this Node's ICU/CLDR data applies
    // "min2" grouping to the generic `es` locale — a 4-digit integer part
    // (1234) renders with no thousands separator ("1234,50"), only 5+ digits
    // do. A 7-digit amount reliably exercises real Intl grouping here.
    expect(formatCurrency(1234567.5, 'USD')).toMatch(/1[.,]234/);
  });

  it('does not throw on an invalid code and falls back to "CODE amount"', () => {
    expect(() => formatCurrency(10, 'NOPE')).not.toThrow();
    expect(formatCurrency(10, 'NOPE')).toBe('NOPE 10.00');
  });

  it('does not throw on an empty code', () => {
    expect(() => formatCurrency(10, '')).not.toThrow();
  });
});

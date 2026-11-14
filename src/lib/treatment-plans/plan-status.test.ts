import { showsQuoteValidity } from './plan-status';

describe('showsQuoteValidity (DX-379)', () => {
  it('solo en borrador y presentado', () => {
    expect(showsQuoteValidity('DRAFT')).toBe(true);
    expect(showsQuoteValidity('PRESENTED')).toBe(true);
    for (const status of ['ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const) {
      expect(showsQuoteValidity(status)).toBe(false);
    }
  });
});

import { localDayRange } from './day-range';

describe('localDayRange', () => {
  it('returns the start-of-day .. next-day boundary for the given local date', () => {
    const { from, to } = localDayRange('2026-03-15');

    expect(new Date(from).toISOString()).toBe(new Date('2026-03-15T00:00:00').toISOString());
    expect(new Date(to).toISOString()).toBe(new Date('2026-03-15T23:59:59.999').toISOString());
  });

  it('`to` is strictly after `from` and both fall on the same local calendar day', () => {
    const { from, to } = localDayRange('2026-07-01');

    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
    // Same local day: exactly one millisecond short of 24h apart.
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('does not leak into the next day for a date with a single-digit day/month', () => {
    const { from, to } = localDayRange('2026-01-05');

    expect(new Date(from).getDate()).toBe(5);
    expect(new Date(to).getDate()).toBe(5);
    expect(new Date(from).getMonth()).toBe(0);
  });
});

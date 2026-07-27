import { formatCivilDate, formatDate, formatDateTime, formatTime } from './date';

describe('formatCivilDate (UTC — the day as picked)', () => {
  it('zero-pads day and month to dd/mm/yyyy', () => {
    expect(formatCivilDate('1990-01-05T00:00:00.000Z')).toBe('05/01/1990');
  });

  it('renders a bare YYYY-MM-DD (parsed as UTC midnight) as the same day', () => {
    expect(formatCivilDate('2026-07-27')).toBe('27/07/2026');
  });

  it('does NOT shift the day for a UTC-midnight value (no off-by-one)', () => {
    // A birth date stored as UTC midnight must always read back as that same
    // calendar day, regardless of the runtime timezone.
    expect(formatCivilDate('2000-12-31T00:00:00.000Z')).toBe('31/12/2000');
  });

  it('falls back for null / empty / invalid input', () => {
    expect(formatCivilDate(null)).toBe('—');
    expect(formatCivilDate('')).toBe('—');
    expect(formatCivilDate('not-a-date')).toBe('—');
    expect(formatCivilDate(undefined, 'N/D')).toBe('N/D');
  });
});

describe('formatDate (local instant → date)', () => {
  it('zero-pads to dd/mm/yyyy', () => {
    const d = new Date(2026, 6, 3, 15, 30); // 3 Jul 2026, local
    expect(formatDate(d)).toBe('03/07/2026');
  });

  it('falls back for invalid input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nope')).toBe('—');
  });
});

describe('formatTime (local 24h)', () => {
  it('renders zero-padded HH:mm', () => {
    const d = new Date(2026, 6, 3, 9, 5);
    expect(formatTime(d)).toBe('09:05');
  });

  it('uses 24h clock', () => {
    const d = new Date(2026, 6, 3, 23, 45);
    expect(formatTime(d)).toBe('23:45');
  });
});

describe('formatDateTime (local)', () => {
  it('joins date and time', () => {
    const d = new Date(2026, 6, 3, 8, 0);
    expect(formatDateTime(d)).toBe('03/07/2026 08:00');
  });
});

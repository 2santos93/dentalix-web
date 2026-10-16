import {
  formatCivilDate,
  formatDate,
  formatDateLabel,
  formatDateTime,
  formatDateTimeInZone,
  formatTime,
  zonedDayStart,
} from './date';

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

describe('formatDateTimeInZone (instant in a given IANA zone)', () => {
  it('renders dd/mm/yyyy HH:mm in the zone, not in the browser one', () => {
    // 2026-10-16 03:30 UTC = 15/10 22:30 in Bogotá (UTC-5) and 05:30 in Madrid (UTC+2).
    const instant = '2026-10-16T03:30:00.000Z';
    expect(formatDateTimeInZone(instant, 'America/Bogota')).toBe('15/10/2026 22:30');
    expect(formatDateTimeInZone(instant, 'Europe/Madrid')).toBe('16/10/2026 05:30');
  });

  it('midnight is 00:00, never 24:00', () => {
    expect(formatDateTimeInZone('2026-10-16T05:00:00.000Z', 'America/Bogota')).toBe(
      '16/10/2026 00:00',
    );
  });

  it('an unknown zone falls back to the browser zone instead of throwing', () => {
    const d = new Date(2026, 6, 3, 8, 0);
    expect(formatDateTimeInZone(d, 'Not/AZone')).toBe('03/07/2026 08:00');
  });

  it('falls back for invalid input', () => {
    expect(formatDateTimeInZone(null, 'America/Bogota')).toBe('—');
    expect(formatDateTimeInZone('nope', 'America/Bogota')).toBe('—');
  });
});

describe('zonedDayStart (civil day in a zone → UTC instant)', () => {
  it('midnight of the day in the zone', () => {
    expect(zonedDayStart('2026-10-16', 'America/Bogota')).toBe('2026-10-16T05:00:00.000Z');
    expect(zonedDayStart('2026-10-16', 'Europe/Madrid')).toBe('2026-10-15T22:00:00.000Z');
    expect(zonedDayStart('2026-01-16', 'Europe/Madrid')).toBe('2026-01-15T23:00:00.000Z');
  });

  it('null for a malformed day', () => {
    expect(zonedDayStart('16/10/2026', 'America/Bogota')).toBeNull();
    expect(zonedDayStart('2026-02-30', 'America/Bogota')).toBeNull();
  });
});

describe('formatDateLabel (DX-063)', () => {
  it('un día civil YYYY-MM-DD se lee como ese día, en español', () => {
    expect(formatDateLabel('2026-03-15', { weekday: 'long', day: 'numeric', month: 'long' })).toBe(
      'domingo, 15 de marzo',
    );
    expect(formatDateLabel('2026-03-01', { month: 'long', year: 'numeric' })).toBe('marzo de 2026');
  });

  it('un instante, en la zona local', () => {
    expect(formatDateLabel('2026-10-20T15:00:00.000Z', { weekday: 'long', day: 'numeric', month: 'long' })).toBe(
      'martes, 20 de octubre',
    );
    expect(formatDateLabel(new Date(2026, 2, 9), { weekday: 'short', day: '2-digit', month: '2-digit' })).toBe(
      'lun, 09/03',
    );
  });

  it('valor vacío o inválido → fallback', () => {
    expect(formatDateLabel(null, { day: 'numeric' })).toBe('—');
    expect(formatDateLabel('no-es-fecha', { day: 'numeric' }, '')).toBe('');
  });
});

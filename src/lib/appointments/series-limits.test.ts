import { parseRecurrence, recurrenceErrorCopy } from './series-limits';

const draft = { intervalWeeks: '4', endMode: 'count' as const, count: '6', until: '' };

describe('parseRecurrence (DX-562)', () => {
  it('cada N semanas y N veces, o hasta una fecha posterior a la primera cita', () => {
    expect(parseRecurrence(draft, '2027-01-11')).toEqual({ ok: true, value: { intervalWeeks: 4, count: 6 } });
    expect(parseRecurrence({ ...draft, endMode: 'until', until: '2027-06-28' }, '2027-01-11')).toEqual({
      ok: true,
      value: { intervalWeeks: 4, until: '2027-06-28' },
    });
  });

  it.each([
    [{ intervalWeeks: '0' }, { interval: recurrenceErrorCopy.interval }],
    [{ intervalWeeks: '13' }, { interval: recurrenceErrorCopy.interval }],
    [{ intervalWeeks: '2.5' }, { interval: recurrenceErrorCopy.interval }],
    [{ count: '1' }, { count: recurrenceErrorCopy.count }],
    [{ count: '27' }, { count: recurrenceErrorCopy.count }],
    [{ endMode: 'until' as const, until: '2027-01-11' }, { until: recurrenceErrorCopy.until }],
    [{ endMode: 'until' as const, until: '' }, { until: recurrenceErrorCopy.until }],
  ])('%j → error junto al campo', (patch, errors) => {
    expect(parseRecurrence({ ...draft, ...patch }, '2027-01-11')).toEqual({ ok: false, errors });
  });
});

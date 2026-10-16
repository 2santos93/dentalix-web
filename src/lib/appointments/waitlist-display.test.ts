import { groupOpeningsByDay, waitingLabel, waitlistOriginLabel } from './waitlist-display';

describe('waitlist-display (DX-122)', () => {
  const now = new Date('2031-03-10T15:00:00');

  it('antigüedad en días de calendario locales', () => {
    expect(waitingLabel(new Date('2031-03-10T08:00:00').toISOString(), now)).toBe('Desde hoy');
    expect(waitingLabel(new Date('2031-03-09T23:00:00').toISOString(), now)).toBe('Hace 1 día');
    expect(waitingLabel(new Date('2031-03-01T10:00:00').toISOString(), now)).toBe('Hace 9 días');
  });

  it('de dónde viene la entrada', () => {
    const start = new Date('2031-03-03T10:00:00').toISOString();
    expect(waitlistOriginLabel({ sourceAppointment: { start, status: 'CANCELLED' } })).toMatch(
      /^Canceló la cita del .+ 10:00$/,
    );
    expect(waitlistOriginLabel({ sourceAppointment: { start, status: 'NO_SHOW' } })).toMatch(
      /^No asistió a la cita del .+ 10:00$/,
    );
    expect(waitlistOriginLabel({ sourceAppointment: null })).toBe('Alta manual');
  });

  it('agrupa los huecos por día local, en orden', () => {
    const groups = groupOpeningsByDay([
      { start: new Date('2031-03-10T09:00:00').toISOString(), end: new Date('2031-03-10T12:00:00').toISOString() },
      { start: new Date('2031-03-10T15:00:00').toISOString(), end: new Date('2031-03-10T19:00:00').toISOString() },
      { start: new Date('2031-03-11T09:00:00').toISOString(), end: new Date('2031-03-11T10:00:00').toISOString() },
    ]);
    expect(groups.map((g) => [g.day, g.openings.length])).toEqual([
      ['2031-03-10', 2],
      ['2031-03-11', 1],
    ]);
  });
});

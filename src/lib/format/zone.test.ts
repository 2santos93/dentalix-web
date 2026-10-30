import { utcOffsetLabel } from './zone';

// Jest corre con TZ=UTC: ninguna de estas zonas es la del entorno.
describe('utcOffsetLabel (DX-362)', () => {
  it('says the offset of the zone at that instant, with a real minus sign', () => {
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'America/Bogota')).toBe('UTC−5');
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'America/New_York')).toBe('UTC−4');
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'Europe/Berlin')).toBe('UTC+2');
  });

  it('changes with daylight saving time', () => {
    expect(utcOffsetLabel(new Date('2026-12-01T12:00:00Z'), 'America/New_York')).toBe('UTC−5');
    expect(utcOffsetLabel(new Date('2026-12-01T12:00:00Z'), 'Europe/Berlin')).toBe('UTC+1');
  });

  it('keeps the minutes of a zone that is not a whole hour away', () => {
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'America/St_Johns')).toBe('UTC−2:30');
  });

  it('is plain UTC at offset zero', () => {
    expect(utcOffsetLabel(new Date('2026-10-16T03:30:00Z'), 'UTC')).toBe('UTC');
    expect(utcOffsetLabel(new Date('2026-12-01T12:00:00Z'), 'Europe/London')).toBe('UTC');
  });
});

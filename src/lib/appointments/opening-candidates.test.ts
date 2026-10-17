import {
  canOfferOpenings,
  canSeeOpeningCandidates,
  freeGaps,
  gapForCancelled,
  offerMessage,
} from './opening-candidates';
import type { BusinessHours } from '@/lib/locations/schedule-api';

// TZ=UTC en los tests: las horas locales son las de la cadena ISO.
const DAY = '2026-10-20'; // martes
const HOURS: BusinessHours = {
  timezone: 'UTC',
  ranges: [
    { weekday: 2, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: 2, startMinute: 15 * 60, endMinute: 19 * 60 },
  ],
};
const at = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const BEFORE = new Date(`${DAY}T06:00:00.000Z`);

describe('offerMessage (DX-210)', () => {
  it('solo nombre de pila, fecha, hora, sede y profesional', () => {
    const text = offerMessage({
      firstName: 'Ana María',
      start: at('10:00'),
      locationName: 'Sede Norte',
      providerName: 'Dra. Pérez',
    });
    expect(text).toBe(
      'Hola Ana, te escribimos de Sede Norte. Se liberó un hueco el martes, 20 de octubre a las 10:00 con Dra. Pérez. ¿Te gustaría tomarlo? Respóndenos por aquí y te lo reservamos.',
    );
  });
});

describe('roles', () => {
  it('recepción y ADMIN ven y ofrecen; el odontólogo solo ve su columna; la asistente nada', () => {
    expect(canSeeOpeningCandidates('RECEPTION', 'u1', 'drx')).toBe(true);
    expect(canSeeOpeningCandidates('ADMIN', 'u1', 'drx')).toBe(true);
    expect(canSeeOpeningCandidates('DENTIST', 'drx', 'drx')).toBe(true);
    expect(canSeeOpeningCandidates('DENTIST', 'dry', 'drx')).toBe(false);
    expect(canSeeOpeningCandidates('ASSISTANT', 'u1', 'drx')).toBe(false);
    expect(canOfferOpenings('RECEPTION')).toBe(true);
    expect(canOfferOpenings('ADMIN')).toBe(true);
    expect(canOfferOpenings('DENTIST')).toBe(false);
    expect(canOfferOpenings(null)).toBe(false);
  });
});

describe('freeGaps', () => {
  const base = {
    date: DAY,
    hours: HOURS,
    blocks: [],
    providerId: 'drx',
    activeLocationId: null,
    now: BEFORE,
  };

  it('el horario menos las citas activas; una cancelada libera su hora', () => {
    const gaps = freeGaps({
      ...base,
      appointments: [
        { providerId: 'drx', start: at('09:00'), end: at('10:00'), status: 'SCHEDULED' },
        { providerId: 'drx', start: at('10:00'), end: at('10:30'), status: 'CANCELLED' },
        { providerId: 'drx', start: at('10:30'), end: at('13:00'), status: 'CONFIRMED' },
        { providerId: 'dry', start: at('15:00'), end: at('19:00'), status: 'SCHEDULED' },
      ],
    });
    expect(gaps.map((g) => [g.start, g.end])).toEqual([
      [at('10:00'), at('10:30')],
      [at('15:00'), at('19:00')],
    ]);
  });

  it('sin el pasado, sin huecos de menos de 15 min, sin bloqueos que no dejan agendar', () => {
    const gaps = freeGaps({
      ...base,
      now: new Date(`${DAY}T09:02:00.000Z`),
      appointments: [
        { providerId: 'drx', start: at('09:10'), end: at('12:00'), status: 'SCHEDULED' },
      ],
      blocks: [
        {
          id: 'b1',
          providerId: null,
          locationId: null,
          start: at('15:00'),
          end: at('17:00'),
          kind: 'MEETING',
          allowsBooking: false,
          note: null,
        },
        {
          id: 'b2',
          providerId: null,
          locationId: null,
          start: at('17:00'),
          end: at('18:00'),
          kind: 'LUNCH',
          allowsBooking: true,
          note: null,
        },
      ],
    });
    expect(gaps.map((g) => [g.start, g.end])).toEqual([
      [at('12:00'), at('13:00')],
      [at('17:00'), at('19:00')],
    ]);
  });

  it('sin horario configurado no propone huecos', () => {
    expect(freeGaps({ ...base, hours: null, appointments: [] })).toEqual([]);
  });

  it('el hueco de una cancelada es el libre que la contiene, o su propia hora', () => {
    const gaps = freeGaps({ ...base, appointments: [] });
    expect(gapForCancelled({ start: at('10:00'), end: at('10:30') }, gaps)).toEqual({
      start: at('09:00'),
      end: at('13:00'),
    });
    expect(gapForCancelled({ start: at('20:00'), end: at('20:30') }, gaps)).toEqual({
      start: at('20:00'),
      end: at('20:30'),
    });
  });
});

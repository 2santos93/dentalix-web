import {
  NOON_ZONE_CANDIDATES,
  SEDE_TODAY_MARGIN_MINUTES,
  atSede,
  birthDateTurnedLastMonth,
  lastSlotToday,
  minutesIntoDay,
  sedeDate,
  sedeTodayZone,
} from '../../e2e/support/clock';
import { regionalFormat } from '@/lib/format/regional-format';
import { utcOffsetLabel } from '@/lib/format/zone';
import { addCivilDays, wallDay, wallMinuteOfDay } from '@/lib/time/wall-clock';

/**
 * DX-520: los helpers de fecha de la e2e (`e2e/support/clock.ts`) y las
 * premisas de zona de los specs, con el reloj FIJO en las fechas que rompían
 * specs: días 1–9, fin de mes (también 28/29 de febrero), fin de año y los
 * días de cambio de horario de varias zonas. La e2e completa corre con el
 * reloj real (la API decide «hoy» con el suyo); aquí se comprueba que lo que
 * el spec calcula para esperar no depende del día en que corre.
 */

/** Zonas con horario de verano en los dos hemisferios y sin él. */
const DST_ZONES = [
  'America/New_York',
  'Europe/Berlin',
  'Europe/London',
  'America/Santiago',
  'Australia/Sydney',
  'America/Sao_Paulo',
  'America/Caracas',
  'Asia/Tokyo',
] as const;

/** Días de cambio de horario 2026–2027 (y el siguiente) de esas zonas. */
const DST_DAYS = [
  '2026-03-08', // Nueva York adelanta
  '2026-03-29', // Berlín y Londres adelantan
  '2026-04-05', // Santiago y Sídney atrasan
  '2026-09-06', // Santiago adelanta
  '2026-10-04', // Sídney adelanta
  '2026-10-25', // Berlín y Londres atrasan
  '2026-11-01', // Nueva York atrasa: desde aquí coincide con Bogotá (UTC−5)
  '2027-03-14', // Nueva York adelanta
  '2027-03-28', // Berlín y Londres adelantan
];

/** Días 1–9, fines de mes (con febrero bisiesto y no) y fin de año. */
const CALENDAR_DAYS = [
  '2026-11-01',
  '2026-11-05',
  '2026-11-09',
  '2026-12-31',
  '2027-01-01',
  '2027-01-31',
  '2027-02-28',
  '2027-03-01',
  '2027-04-30',
  '2028-02-29',
  '2028-03-01',
];

/** Horas del día en que corre la suite: madrugada, mediodía y casi medianoche (UTC). */
const UTC_HOURS = ['00:10', '04:40', '12:00', '23:50'];

const NOWS = [...DST_DAYS, ...CALENDAR_DAYS].flatMap((day) =>
  UTC_HOURS.map((hhmm) => new Date(`${day}T${hhmm}:00Z`)),
);

afterEach(() => {
  jest.useRealTimers();
});

describe('atSede: el instante de una hora de pared de la sede, también el día del cambio de horario', () => {
  it.each(DST_ZONES.flatMap((zone) => [...DST_DAYS, ...CALENDAR_DAYS].map((day) => [zone, day] as const)))(
    '%s el %s: cada hora que existe vuelve a marcarse igual en el reloj de la sede',
    (zone, day) => {
      for (let minute = 0; minute < 24 * 60; minute += 30) {
        const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        const at = atSede(day, hhmm, zone);
        const wall = wallMinuteOfDay(at, zone);
        if (wall === minute) {
          expect(wallDay(at, zone)).toBe(day);
        } else {
          // Solo la hora que el reloj se salta al adelantarse: se corre hacia delante, el mismo día.
          expect(wall - minute).toBe(60);
          expect(wallDay(at, zone)).toBe(day);
        }
      }
    },
  );

  it('Nueva York el 1-nov-2026 a las 00:30 todavía va en UTC−4 (el desfase del mediodía es −5)', () => {
    expect(atSede('2026-11-01', '00:30', 'America/New_York').toISOString()).toBe('2026-11-01T04:30:00.000Z');
    expect(atSede('2026-11-01', '12:00', 'America/New_York').toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });

  it('rechaza una hora que no es HH:MM', () => {
    expect(() => atSede('2026-11-01', '9:00', 'America/Caracas')).toThrow(RangeError);
  });
});

describe('«hoy» de la sede con el reloj fijo (DX-449)', () => {
  it.each(NOWS.map((now) => [now.toISOString(), now] as const))(
    'a las %s la zona de hoy deja margen y la última franja de hoy se puede agendar',
    (_label, now) => {
      jest.useFakeTimers({ now, doNotFake: ['setTimeout', 'setInterval', 'nextTick', 'setImmediate', 'queueMicrotask'] });
      const zone = sedeTodayZone(now);
      expect([...NOON_ZONE_CANDIDATES]).toContain(zone);
      const minutes = minutesIntoDay(now, zone);
      expect(minutes).toBeGreaterThanOrEqual(SEDE_TODAY_MARGIN_MINUTES);
      expect(24 * 60 - minutes).toBeGreaterThanOrEqual(SEDE_TODAY_MARGIN_MINUTES);
      const slot = lastSlotToday('23:55', '23:59', zone);
      expect(slot.day).toBe(sedeDate(now, zone));
      expect(slot.start.getTime()).toBeGreaterThan(now.getTime());
      expect(wallDay(slot.end, zone)).toBe(slot.day);
    },
  );
});

describe('birthDateTurnedLastMonth: la edad exacta a cualquier fecha', () => {
  const ageOn = (birth: string, today: string): number => {
    const [by, bm, bd] = birth.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    return ty! - by! - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
  };
  it.each([...DST_DAYS, ...CALENDAR_DAYS])('hoy %s', (today) => {
    for (const years of [0, 1, 6, 17, 18, 21, 65]) {
      const birth = birthDateTurnedLastMonth(years, today);
      expect(ageOn(birth, today)).toBe(years);
      // Lejos del cumpleaños: ni ayer ni mañana cambian la edad.
      expect(ageOn(birth, addCivilDays(today, -1))).toBe(years);
      expect(ageOn(birth, addCivilDays(today, 1))).toBe(years);
    }
  });
});

describe('premisas de zona de audit-log-zones.spec.ts (DX-362, DX-520)', () => {
  const every6hFrom2026To2028 = Array.from(
    { length: 3 * 366 * 4 },
    (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 6 * 60 * 60 * 1000),
  );
  const offsetsOn = (zone: string) => every6hFrom2026To2028.map((at) => utcOffsetLabel(at, zone));

  it('Bogotá y Nueva York coinciden en invierno: con ellas el spec dependía de la fecha', () => {
    const at = new Date('2026-11-01T17:00:00Z');
    expect(utcOffsetLabel(at, 'America/Bogota')).toBe(utcOffsetLabel(at, 'America/New_York'));
  });

  it('São Paulo nunca marca la hora de Nueva York ni la de Berlín; Buenos Aires siempre la de São Paulo', () => {
    const saoPaulo = offsetsOn('America/Sao_Paulo');
    const newYork = offsetsOn('America/New_York');
    const berlin = offsetsOn('Europe/Berlin');
    const buenosAires = offsetsOn('America/Argentina/Buenos_Aires');
    saoPaulo.forEach((offset, i) => {
      expect(offset).not.toBe(newYork[i]);
      expect(offset).not.toBe(berlin[i]);
      expect(offset).toBe(buenosAires[i]);
      expect(berlin[i]).not.toBe(newYork[i]);
    });
  });
});

describe('día/mes de la sede (DX-520): la regla sale del locale, nunca de un país', () => {
  // Patrón corto de día-mes de CLDR: es-* sin ceros; otros locales con ellos.
  it.each([
    ['es-VE', 'America/Caracas', ['1/11', '9/11', '31/12', '1/1', '29/2']],
    ['es-ES', 'Europe/Madrid', ['1/11', '9/11', '31/12', '1/1', '29/2']],
    ['en-GB', 'Europe/London', ['01/11', '09/11', '31/12', '01/01', '29/02']],
    ['en-US', 'America/New_York', ['11/01', '11/09', '12/31', '01/01', '02/29']],
    ['pt-BR', 'America/Sao_Paulo', ['01/11', '09/11', '31/12', '01/01', '29/02']],
  ] as const)('%s en %s', (locale, zone, expected) => {
    const fmt = regionalFormat({ locale, hourCycle: 'h23' });
    const days = ['2026-11-01', '2026-11-09', '2026-12-31', '2027-01-01', '2028-02-29'];
    expect(days.map((day) => fmt.dayMonth(atSede(day, '12:00', zone), zone))).toEqual(expected);
  });
});

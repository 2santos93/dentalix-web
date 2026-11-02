import { auditTime, auditZoneHint } from './audit-time';
import { locationNameMap } from './audit-labels';
import { testAgendaClock } from '@/lib/test/sede-clock';
import { clinicLocation } from '@/lib/test/locations';

// DX-362: una clínica con sedes en tres zonas. Jest corre con TZ=UTC, que no
// es la zona de ninguna: una hora con la zona del navegador no pasaría.
const caracas = clinicLocation({
  id: 'caracas',
  name: 'Caracas',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
  createdAt: '2026-01-01T00:00:00.000Z',
});
const berlin = clinicLocation({
  id: 'berlin',
  name: 'Berlín',
  timeZone: 'Europe/Berlin',
  locale: 'es-ES',
  hourCycle: 'h23',
});
const newYork = clinicLocation({
  id: 'nueva-york',
  name: 'Nueva York',
  timeZone: 'America/New_York',
  locale: 'en-US',
  hourCycle: 'h12',
});
const SEDES = [caracas, berlin, newYork];
const NAMES = locationNameMap(SEDES);

// El mismo instante en las tres: 23:30 en la sede, 05:30 en Berlín, 23:30 en Nueva York
// (en octubre, Nueva York y Caracas comparten desfase: en diciembre ya no).
const AT = '2026-10-16T03:30:00.000Z';
const event = (locationId: string | null, timeZone = 'America/Caracas') => ({
  occurredAt: AT,
  locationId,
  timeZone,
});

describe('auditTime', () => {
  it('the same instant reads the same in every row: the zone of the screen, with its offset', () => {
    const clock = testAgendaClock(SEDES, null); // «Todas las sedes» → la principal, Caracas.
    const rows = [
      event('caracas'),
      event('berlin', 'Europe/Berlin'),
      event('nueva-york', 'America/New_York'),
      event(null), // Un inicio de sesión: sin sede.
    ].map((e) => auditTime(e, clock, NAMES));
    for (const row of rows) {
      expect(row.reference).toEqual({ when: '15/10/2026 11:30 p. m.', offset: 'UTC−4' });
      expect(row.iso).toBe(AT);
    }
  });

  it('a row of another zone adds the hour of its own sede, with its format and its offset', () => {
    const clock = testAgendaClock(SEDES, null);
    expect(auditTime(event('berlin', 'Europe/Berlin'), clock, NAMES).sede).toEqual({
      name: 'Berlín',
      when: '16/10/2026 05:30',
      offset: 'UTC+2',
    });
    const december = {
      occurredAt: '2026-12-01T03:30:00.000Z',
      locationId: 'nueva-york',
      timeZone: 'America/New_York',
    };
    expect(auditTime(december, clock, NAMES).sede).toEqual({
      name: 'Nueva York',
      when: '11/30/2026 10:30 p. m.',
      offset: 'UTC−5',
    });
  });

  it('no second hour for the sede of the screen, nor for an event without a sede', () => {
    const clock = testAgendaClock(SEDES, null);
    expect(auditTime(event('caracas'), clock, NAMES).sede).toBeNull();
    expect(auditTime(event(null), clock, NAMES).sede).toBeNull();
  });

  it('the active sede is the reference: with Berlín active, Caracas gets its second hour', () => {
    const clock = testAgendaClock(SEDES, 'berlin');
    const row = auditTime(event('caracas'), clock, NAMES);
    expect(row.reference).toEqual({ when: '16/10/2026 05:30', offset: 'UTC+2' });
    expect(row.sede).toEqual({ name: 'Caracas', when: '15/10/2026 11:30 p. m.', offset: 'UTC−4' });
    expect(auditTime(event(null), clock, NAMES).reference.offset).toBe('UTC+2');
  });

  it('another zone with the same offset at that instant does not repeat the hour', () => {
    const laPaz = clinicLocation({ id: 'la-paz', name: 'La Paz', timeZone: 'America/La_Paz', locale: 'es-BO' });
    const clock = testAgendaClock([caracas, laPaz], null);
    expect(auditTime(event('la-paz', 'America/La_Paz'), clock, locationNameMap([caracas, laPaz])).sede).toBeNull();
  });

  it('the offset follows daylight saving: Nueva York is UTC−5 in December', () => {
    const clock = testAgendaClock(SEDES, null);
    const row = auditTime(
      { occurredAt: '2026-12-01T15:00:00.000Z', locationId: 'nueva-york', timeZone: 'America/New_York' },
      clock,
      NAMES,
    );
    expect(row.reference).toEqual({ when: '01/12/2026 11:00 a. m.', offset: 'UTC−4' });
    expect(row.sede).toEqual({ name: 'Nueva York', when: '12/01/2026 10:00 a. m.', offset: 'UTC−5' });
    // En octubre, mismo desfase que la sede: la hora no se repite.
    expect(auditTime(event('nueva-york', 'America/New_York'), clock, NAMES).sede).toBeNull();
  });

  it('a sede without its format shows «—», never the hour in another format', () => {
    const noFormat = clinicLocation({ id: 'sin-formato', name: 'Sin formato', timeZone: 'Europe/Berlin', locale: null });
    const clock = testAgendaClock([caracas, noFormat], null);
    expect(
      auditTime(event('sin-formato', 'Europe/Berlin'), clock, locationNameMap([caracas, noFormat])).sede,
    ).toEqual({ name: 'Sin formato', when: '—', offset: null });
  });

  it('a sede that is no longer in the list: «Su sede» and «—», never its id', () => {
    const clock = testAgendaClock(SEDES, null);
    expect(auditTime(event('borrada', 'Asia/Tokyo'), clock, NAMES).sede).toEqual({
      name: 'Su sede',
      when: '—',
      offset: null,
    });
    // Ni con el mismo desfase que la pantalla hace falta repetirla.
    expect(auditTime(event('borrada', 'America/Caracas'), clock, NAMES).sede).toBeNull();
  });
});

describe('auditZoneHint', () => {
  it('names the sede, the IANA zone and its offset now, and says the order', () => {
    const clock = testAgendaClock(SEDES, null);
    expect(auditZoneHint(caracas, clock, new Date(AT))).toBe(
      'Horas y días en la hora de Caracas (America/Caracas, UTC−4). Lo más reciente, arriba.',
    );
    const berlinClock = testAgendaClock(SEDES, 'berlin');
    expect(auditZoneHint(berlin, berlinClock, new Date('2026-12-01T12:00:00Z'))).toBe(
      'Horas y días en la hora de Berlín (Europe/Berlin, UTC+1). Lo más reciente, arriba.',
    );
  });
});

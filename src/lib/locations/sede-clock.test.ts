import { act, renderHook, waitFor } from '@testing-library/react';
import {
  locationClock,
  sedeClockFor,
  sedeTime,
  sedeTimeRange,
  useSedeClock,
} from './sede-clock';
import { listLocations } from './locations-api';
import { setActiveLocationId } from './location-store';
import { SEDE_LOCALE_ERROR } from './use-sede-format';
import { NO_ACTIVE_LOCATION_ERROR, SEDE_TIME_ZONE_ERROR } from './use-sede-time-zone';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

// Jest corre con TZ=UTC: ninguna sede de estas pruebas está en UTC.
const caracas = clinicLocation({ id: 'caracas', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' });
const madrid = clinicLocation({ id: 'madrid', timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23' });
const AT_1930_UTC = '2026-10-27T19:30:00.000Z';

describe('locationClock', () => {
  it('is the zone and the format of the sede', () => {
    const clock = locationClock(caracas);
    expect(clock?.timeZone).toBe('America/Caracas');
    expect(clock?.fmt).toMatchObject({ locale: 'es-VE', hourCycle: 'h12' });
  });

  it('is null without a usable zone or format, never another value', () => {
    expect(locationClock(clinicLocation({ timeZone: null }))).toBeNull();
    expect(locationClock(clinicLocation({ timeZone: 'Mars/Olympus' }))).toBeNull();
    expect(locationClock(clinicLocation({ locale: null }))).toBeNull();
    expect(locationClock(clinicLocation({ hourCycle: null }))).toBeNull();
    expect(locationClock(undefined)).toBeNull();
  });
});

describe('sedeTime / sedeTimeRange', () => {
  it('h12 sede: «3:30 p. m.» in its own zone', () => {
    const clock = locationClock(caracas);
    expect(sedeTime(AT_1930_UTC, clock)).toBe('3:30 p. m.');
    expect(sedeTimeRange(AT_1930_UTC, '2026-10-27T20:00:00.000Z', clock)).toBe('3:30 p. m. – 4:00 p. m.');
  });

  it('h23 sede: «20:30» in its own zone, compact range', () => {
    const clock = locationClock(madrid);
    expect(sedeTime(AT_1930_UTC, clock)).toBe('20:30');
    expect(sedeTimeRange(AT_1930_UTC, '2026-10-27T20:00:00.000Z', clock)).toBe('20:30–21:00');
  });

  it('without the clock of the sede: «—», never the browser time', () => {
    expect(sedeTime(AT_1930_UTC, null)).toBe('—');
    expect(sedeTimeRange(AT_1930_UTC, AT_1930_UTC, null)).toBe('—');
  });
});

describe('sedeClockFor', () => {
  it('the active sede decides the screen clock; each appointment keeps the clock of its sede', () => {
    const result = sedeClockFor([madrid, caracas], 'caracas');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.clock.timeZone).toBe('America/Caracas');
    expect(result.clock.of('madrid')?.timeZone).toBe('Europe/Madrid');
    expect(result.clock.of('madrid')?.fmt.hourCycle).toBe('h23');
    expect(result.clock.of('desconocida')).toBeNull();
  });

  it('«Todas las sedes» uses the principal sede (the oldest active one)', () => {
    const retired = clinicLocation({ id: 'retired', isActive: false, timeZone: 'Asia/Tokyo' });
    const result = sedeClockFor([retired, madrid, caracas], null);
    expect(result).toMatchObject({ status: 'ready', clock: { timeZone: 'Europe/Madrid' } });
  });

  it('an explicit sede wins over the active one', () => {
    expect(sedeClockFor([madrid, caracas], 'madrid', 'caracas')).toMatchObject({
      status: 'ready',
      clock: { timeZone: 'America/Caracas' },
    });
  });

  it('says which data of which sede is missing', () => {
    expect(sedeClockFor([clinicLocation({ id: 'x', timeZone: null })], 'x')).toEqual({
      status: 'error',
      kind: 'timeZone',
      message: SEDE_TIME_ZONE_ERROR,
      locationId: 'x',
    });
    expect(sedeClockFor([clinicLocation({ id: 'x', hourCycle: null })], 'x')).toEqual({
      status: 'error',
      kind: 'locale',
      message: SEDE_LOCALE_ERROR,
      locationId: 'x',
    });
    expect(sedeClockFor([clinicLocation({ isActive: false })], null)).toEqual({
      status: 'error',
      kind: 'timeZone',
      message: NO_ACTIVE_LOCATION_ERROR,
      locationId: null,
    });
  });
});

describe('useSedeClock', () => {
  afterEach(() => {
    act(() => setActiveLocationId(null));
    listLocationsMock.mockReset();
  });

  it('loading, then the clock of the active sede; follows the sede switch', async () => {
    listLocationsMock.mockResolvedValue([madrid, caracas]);
    const { result } = renderHook(() => useSedeClock('tok'));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ clock: { timeZone: 'Europe/Madrid' } });
    act(() => setActiveLocationId('caracas'));
    expect(result.current).toMatchObject({ clock: { timeZone: 'America/Caracas' } });
  });

  it('a failed list is an error with its retry, which reads the list again', async () => {
    listLocationsMock.mockRejectedValueOnce(new Error('red')).mockResolvedValue([caracas]);
    const { result } = renderHook(() => useSedeClock('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: null });
    act(() => {
      if (result.current.status === 'error') result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { clinicLocation } from '@/lib/test/locations';
import { caracasSede } from '@/lib/test/sede-clock';
import { testStamp } from '@/lib/test/stamp';
import { listLocations } from './locations-api';
import { setActiveLocationId } from './location-store';
import { stampPainters, useSedeStamp } from './sede-stamp';
import { SEDE_LOCALE_ERROR } from './use-sede-format';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

// Jest corre con TZ=UTC: ninguna de las dos sedes es la del entorno.
const caracas = caracasSede({ id: 'caracas', name: 'Caracas' });
const berlin = clinicLocation({
  id: 'berlin',
  name: 'Berlín',
  timeZone: 'Europe/Berlin',
  locale: 'de-DE',
  hourCycle: 'h23',
  currency: 'EUR',
});
const unconfigured = clinicLocation({ id: 'sin-formato', name: 'Sin formato', locale: null, hourCycle: null });
const ve12 = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const de24 = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
const AT = '2026-11-05T18:30:00.000Z';

describe('stampPainters', () => {
  it('paints a Caracas 12 h screen with its own format, not the environment one', () => {
    const stamp = testStamp([caracas]);
    const expected = ve12.dateTime(new Date(AT), 'America/Caracas');
    expect(stamp.dateTime(AT)).toBe(expected);
    expect(stamp.dateTime(AT)).not.toBe(new Date(AT).toLocaleString());
    expect(stamp.date(AT)).toBe(ve12.date(new Date(AT), 'America/Caracas'));
    expect(stamp.time(AT)).toBe(ve12.time(new Date(AT), 'America/Caracas'));
    expect(stamp.civilDate('2026-11-05')).toBe(ve12.civilDate('2026-11-05'));
    expect(stamp.civilDate('2026-11-05T00:00:00.000Z')).toBe(ve12.civilDate('2026-11-05'));
    expect(stamp.money(1234.5, 'USD')).toBe(moneyWithCode(1234.5, 'USD', ve12));
  });

  it('paints the same input differently on a Berlin 24 h screen', () => {
    const stamp = testStamp([berlin]);
    expect(stamp.dateTime(AT)).toBe(de24.dateTime(new Date(AT), 'Europe/Berlin'));
    expect(stamp.dateTime(AT)).not.toBe(testStamp([caracas]).dateTime(AT));
    expect(stamp.civilDate('2026-11-05')).toBe('05.11.2026');
    expect(stamp.money(1234.5, 'EUR')).toBe(moneyWithCode(1234.5, 'EUR', de24));
  });

  it('a row with a locationId uses that sede (date, time and amount from the same clock), not the screen', () => {
    const stamp = testStamp([caracas, berlin]);
    expect(stamp.dateTime(AT, 'berlin')).toBe(de24.dateTime(new Date(AT), 'Europe/Berlin'));
    expect(stamp.date(AT, 'berlin')).toBe(de24.date(new Date(AT), 'Europe/Berlin'));
    expect(stamp.time(AT, 'berlin')).toBe(de24.time(new Date(AT), 'Europe/Berlin'));
    expect(stamp.civilDate('2026-11-05', 'berlin')).toBe(de24.civilDate('2026-11-05'));
    expect(stamp.money(1234.5, 'EUR', 'berlin')).toBe(moneyWithCode(1234.5, 'EUR', de24));
    expect(stamp.dateTime(AT, 'caracas')).toBe(ve12.dateTime(new Date(AT), 'America/Caracas'));
  });

  it('an unknown or unconfigured locationId is «—», never the screen clock', () => {
    const stamp = testStamp([caracas, unconfigured]);
    for (const id of ['desconocida', 'sin-formato']) {
      expect(stamp.date(AT, id)).toBe('—');
      expect(stamp.time(AT, id)).toBe('—');
      expect(stamp.dateTime(AT, id)).toBe('—');
      expect(stamp.civilDate('2026-11-05', id)).toBe('—');
      expect(stamp.money(5, 'USD', id)).toBe('—');
    }
  });

  it('a missing or invalid instant or day is «—» (and null in maybe)', () => {
    const stamp = testStamp([caracas]);
    for (const bad of [null, undefined, '', 'no es una fecha']) {
      expect(stamp.dateTime(bad)).toBe('—');
      expect(stamp.maybe.dateTime(bad)).toBeNull();
    }
    expect(stamp.civilDate('2026-02-30')).toBe('—');
    expect(stamp.civilDate(null)).toBe('—');
  });

  it('exposes the screen format (null without a clock) for painters that bring their own zone', () => {
    expect(testStamp([caracas]).fmt).toMatchObject({ locale: 'es-VE', hourCycle: 'h12' });
    expect(stampPainters(null).fmt).toBeNull();
  });

  it('without a clock everything is «—» and maybe gives null (mobileCell)', () => {
    const stamp = stampPainters(null);
    expect(stamp.date(AT)).toBe('—');
    expect(stamp.dateTime(AT)).toBe('—');
    expect(stamp.civilDate('2026-11-05')).toBe('—');
    expect(stamp.money(1, 'USD')).toBe('—');
    expect(stamp.maybe.date(AT)).toBeNull();
    expect(stamp.maybe.time(AT)).toBeNull();
    expect(stamp.maybe.dateTime(AT)).toBeNull();
    expect(stamp.maybe.civilDate('2026-11-05')).toBeNull();
  });

  it('midnight: 03:30Z is 4 November 23:30 in Caracas and 5 November in Berlin', () => {
    const instant = '2026-11-05T03:30:00.000Z';
    const stamp = testStamp([caracas, berlin]);
    expect(stamp.date(instant, 'caracas')).toBe(ve12.civilDate('2026-11-04'));
    expect(stamp.date(instant, 'berlin')).toBe(de24.civilDate('2026-11-05'));
    expect(stamp.dateTime(instant, 'caracas')).toBe(ve12.dateTime(new Date(instant), 'America/Caracas'));
  });
});

describe('useSedeStamp', () => {
  afterEach(() => {
    act(() => setActiveLocationId(null));
    listLocationsMock.mockReset();
  });

  it('loading: «—» and no notice (the note does not flash)', () => {
    listLocationsMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSedeStamp('tok', ['berlin']));
    expect(result.current.ready).toBe(false);
    expect(result.current.dateTime(AT)).toBe('—');
    expect(result.current.notice).toBeNull();
  });

  it('ready: paints with the screen sede and each row with its own', async () => {
    listLocationsMock.mockResolvedValue([caracas, berlin]);
    const { result } = renderHook(() => useSedeStamp('tok', ['berlin', 'caracas']));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.dateTime(AT)).toBe(ve12.dateTime(new Date(AT), 'America/Caracas'));
    expect(result.current.dateTime(AT, 'berlin')).toBe(de24.dateTime(new Date(AT), 'Europe/Berlin'));
    expect(result.current.notice).toBeNull();
  });

  it('a row sede that is unknown gives «—» and one notice with that locationId', async () => {
    listLocationsMock.mockResolvedValue([caracas]);
    const { result } = renderHook(() => useSedeStamp('tok', ['fantasma', 'caracas', 'otra']));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.dateTime(AT, 'fantasma')).toBe('—');
    expect(result.current.notice).toMatchObject({ kind: 'locale', locationId: 'fantasma', message: SEDE_LOCALE_ERROR });
  });

  it('a failed list is «—» and a locale notice with a retry that reads the list again', async () => {
    listLocationsMock.mockRejectedValueOnce(new Error('red')).mockResolvedValue([caracas]);
    const { result } = renderHook(() => useSedeStamp('tok'));
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(result.current.dateTime(AT)).toBe('—');
    expect(result.current.notice).toMatchObject({ kind: 'locale', locationId: null });
    act(() => result.current.notice?.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.notice).toBeNull();
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('a screen sede without format is an error notice for that sede', async () => {
    listLocationsMock.mockResolvedValue([unconfigured, caracas]);
    const { result } = renderHook(() => useSedeStamp('tok'));
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(result.current.ready).toBe(false);
    expect(result.current.notice).toMatchObject({ locationId: 'sin-formato' });
  });
});

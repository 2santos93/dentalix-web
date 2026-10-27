import { act, renderHook, waitFor } from '@testing-library/react';
import { pickSedeFormat, SEDE_LOCALE_ERROR, useSedeFormat } from './use-sede-format';
import { NO_ACTIVE_LOCATION_ERROR } from './use-sede-time-zone';
import { listLocations, type ClinicLocation } from './locations-api';
import { setActiveLocationId } from './location-store';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

const sede = (id: string, locale: string | null, hourCycle: ClinicLocation['hourCycle']): ClinicLocation =>
  clinicLocation({ id, name: id, locale, hourCycle });

const principal = sede('principal', 'ja-JP', 'h23');
const newYork = sede('new-york', 'en-US', 'h12');
const berlin = sede('berlin', 'de-DE', 'h23');

const AT_1505_UTC = new Date('2026-10-27T15:05:00Z');

describe('pickSedeFormat', () => {
  it('active en-US h12 location gives that format', () => {
    const fmt = pickSedeFormat([principal, newYork], 'new-york');
    expect(fmt).toMatchObject({ locale: 'en-US', hourCycle: 'h12' });
    expect(fmt?.dateTime(AT_1505_UTC, 'UTC')).toBe('10/27/2026 3:05 p. m.');
  });

  it('all-locations view uses the principal location', () => {
    expect(pickSedeFormat([principal, newYork], null)).toMatchObject({ locale: 'ja-JP', hourCycle: 'h23' });
    expect(pickSedeFormat([berlin, newYork], 'retirada')).toMatchObject({ locale: 'de-DE', hourCycle: 'h23' });
    // La principal es la activa más antigua: una desactivada primero no cuenta (R6).
    const retirada = clinicLocation({ id: 'retirada', isActive: false, locale: 'fr-FR', hourCycle: 'h12' });
    expect(pickSedeFormat([retirada, berlin], null)).toMatchObject({ locale: 'de-DE' });
  });

  it('a location without locale or hourCycle gives null, never another location or the browser', () => {
    expect(pickSedeFormat([], null)).toBeNull();
    expect(pickSedeFormat([sede('x', null, 'h23'), principal], 'x')).toBeNull();
    expect(pickSedeFormat([sede('x', 'en-US', null), principal], 'x')).toBeNull();
    expect(pickSedeFormat([sede('x', 'not a locale', 'h12')], 'x')).toBeNull();
  });
});

describe('useSedeFormat', () => {
  afterEach(() => {
    act(() => setActiveLocationId(null));
    listLocationsMock.mockReset();
  });

  it('loading while it loads, then the active location format; follows the location switch', async () => {
    listLocationsMock.mockResolvedValue([principal, newYork]);
    const { result } = renderHook(() => useSedeFormat('tok'));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', fmt: { locale: 'ja-JP', hourCycle: 'h23' } });

    act(() => setActiveLocationId('new-york'));
    expect(result.current).toMatchObject({ status: 'ready', fmt: { locale: 'en-US', hourCycle: 'h12' } });
  });

  it('useSedeFormat without locale or hourCycle is error, never another value', async () => {
    for (const broken of [sede('sin-formato', null, 'h23'), sede('sin-reloj', 'en-US', null)]) {
      listLocationsMock.mockResolvedValue([broken, principal]);
      act(() => setActiveLocationId(broken.id));
      const { result, unmount } = renderHook(() => useSedeFormat('tok'));
      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current).toMatchObject({ status: 'error', message: SEDE_LOCALE_ERROR });
      expect(result.current).not.toHaveProperty('fmt');
      unmount();
    }
  });

  it('no active location: the API message (create one in Ajustes → Sedes)', async () => {
    listLocationsMock.mockResolvedValue([clinicLocation({ isActive: false })]);
    const { result } = renderHook(() => useSedeFormat('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ message: NO_ACTIVE_LOCATION_ERROR });
  });

  it('if the location list fails, error; Reintentar reads it again and recovers', async () => {
    listLocationsMock.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce([newYork]);
    const { result } = renderHook(() => useSedeFormat('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ message: SEDE_LOCALE_ERROR });

    act(() => {
      if (result.current.status === 'error') result.current.retry();
    });
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ fmt: { locale: 'en-US', hourCycle: 'h12' } });
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('the copy is the one from spec §10', () => {
    expect(SEDE_LOCALE_ERROR).toBe(
      'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
    );
  });
});

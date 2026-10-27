import { act, renderHook, waitFor } from '@testing-library/react';
import { pickSedeTimeZone, sedeToday, useSedeTimeZone, SEDE_TIME_ZONE_ERROR } from './use-sede-time-zone';
import { listLocations, type ClinicLocation } from './locations-api';
import { setActiveLocationId } from './location-store';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

const sede = (id: string, timeZone: string | null): ClinicLocation =>
  clinicLocation({ id, name: id, timeZone, country: timeZone === 'Europe/Madrid' ? 'ES' : 'CO' });

const principal = sede('principal', 'America/Bogota');
const madrid = sede('madrid', 'Europe/Madrid');
const tokyo = sede('tokyo', 'Asia/Tokyo');

describe('pickSedeTimeZone', () => {
  it('la zona de la sede activa', () => {
    expect(pickSedeTimeZone([principal, madrid], 'madrid')).toBe('Europe/Madrid');
  });

  it('sin sede activa (todas las sedes) o con una que ya no está: la principal', () => {
    expect(pickSedeTimeZone([tokyo, principal], null)).toBe('Asia/Tokyo');
    expect(pickSedeTimeZone([madrid, principal], 'retirada')).toBe('Europe/Madrid');
  });

  it('no zone gives error state, never America/Bogota', () => {
    expect(pickSedeTimeZone([], null)).toBeNull();
    expect(pickSedeTimeZone([sede('x', 'Mars/Olympus')], 'x')).toBeNull();
    expect(pickSedeTimeZone([sede('x', null), principal], 'x')).toBeNull();
  });
});

describe('sedeToday', () => {
  const lateEvening = new Date('2026-10-15T22:30:00.000Z');

  it('hoy en la zona de la sede', () => {
    expect(sedeToday('America/Bogota', lateEvening)).toBe('2026-10-15');
    expect(sedeToday('Asia/Tokyo', lateEvening)).toBe('2026-10-16');
  });

  it('con una zona que no existe lanza en vez de contar el día en otra', () => {
    expect(() => sedeToday('Mars/Olympus', lateEvening)).toThrow(RangeError);
  });
});

describe('useSedeTimeZone', () => {
  afterEach(() => {
    act(() => setActiveLocationId(null));
    listLocationsMock.mockReset();
  });

  it('loading mientras carga, luego la zona de la sede activa; sigue el cambio de sede', async () => {
    listLocationsMock.mockResolvedValue([tokyo, madrid]);
    const { result } = renderHook(() => useSedeTimeZone('tok'));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', timeZone: 'Asia/Tokyo' }));

    act(() => setActiveLocationId('madrid'));
    expect(result.current).toEqual({ status: 'ready', timeZone: 'Europe/Madrid' });
  });

  it('location with null timeZone gives error state, never Bogotá', async () => {
    listLocationsMock.mockResolvedValue([sede('sin-zona', null)]);
    const { result } = renderHook(() => useSedeTimeZone('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ status: 'error', message: SEDE_TIME_ZONE_ERROR });
    expect(JSON.stringify(result.current)).not.toContain('America/Bogota');
  });

  it('si la lista de sedes falla, error; Reintentar vuelve a leer y se recupera', async () => {
    listLocationsMock.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce([tokyo]);
    const { result } = renderHook(() => useSedeTimeZone('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      if (result.current.status === 'error') result.current.retry();
    });
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', timeZone: 'Asia/Tokyo' }));
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });
});

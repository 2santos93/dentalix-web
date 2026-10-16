import { act, renderHook, waitFor } from '@testing-library/react';
import { pickSedeTimeZone, useSedeTimeZone } from './use-sede-time-zone';
import { listLocations, type ClinicLocation } from './locations-api';
import { setActiveLocationId } from './location-store';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

const sede = (id: string, timeZone: string): ClinicLocation => ({
  id,
  name: id,
  address: null,
  country: timeZone === 'Europe/Madrid' ? 'ES' : 'CO',
  isActive: true,
  timeZone,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const principal = sede('principal', 'America/Bogota');
const madrid = sede('madrid', 'Europe/Madrid');

describe('pickSedeTimeZone', () => {
  it('la zona de la sede activa', () => {
    expect(pickSedeTimeZone([principal, madrid], 'madrid')).toBe('Europe/Madrid');
  });

  it('sin sede activa (todas las sedes) o con una que ya no está: la principal', () => {
    expect(pickSedeTimeZone([madrid, principal], null)).toBe('Europe/Madrid');
    expect(pickSedeTimeZone([principal, madrid], 'retirada')).toBe('America/Bogota');
  });

  it('sin sedes o con una zona inválida: la zona por defecto, no la del navegador', () => {
    expect(pickSedeTimeZone([], null)).toBe('America/Bogota');
    expect(pickSedeTimeZone([sede('x', 'Mars/Olympus')], 'x')).toBe('America/Bogota');
  });
});

describe('useSedeTimeZone', () => {
  afterEach(() => {
    act(() => setActiveLocationId(null));
    listLocationsMock.mockReset();
  });

  it('null mientras carga, luego la zona de la sede activa; sigue el cambio de sede', async () => {
    listLocationsMock.mockResolvedValue([principal, madrid]);
    const { result } = renderHook(() => useSedeTimeZone('tok'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('America/Bogota'));

    act(() => setActiveLocationId('madrid'));
    expect(result.current).toBe('Europe/Madrid');
  });

  it('si la lista de sedes falla, la zona por defecto (la pantalla no se queda cargando)', async () => {
    listLocationsMock.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useSedeTimeZone('tok'));
    await waitFor(() => expect(result.current).toBe('America/Bogota'));
  });
});

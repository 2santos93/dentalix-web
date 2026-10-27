import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SessionLocationsProvider, useSessionLocations } from './session-locations';
import { listLocations } from './locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionLocationsProvider token="tok">{children}</SessionLocationsProvider>
);

describe('SessionLocationsProvider', () => {
  afterEach(() => listLocationsMock.mockReset());

  it('una sola lectura para todos los consumidores de la sesión', async () => {
    listLocationsMock.mockResolvedValue([clinicLocation()]);
    const { result } = renderHook(() => useSessionLocations('tok'), { wrapper });
    await Promise.all([result.current(), result.current()]);
    expect(listLocationsMock).toHaveBeenCalledTimes(1);
  });

  it('invalidate refetches locations', async () => {
    const tokyo = clinicLocation({ id: 'tokyo', name: 'Tokio', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' });
    listLocationsMock.mockResolvedValueOnce([clinicLocation()]).mockResolvedValueOnce([clinicLocation(), tokyo]);
    const { result } = renderHook(() => useSessionLocations('tok'), { wrapper });
    expect(await result.current()).toHaveLength(1);
    const before = result.current;

    act(() => result.current.invalidate());

    // El lector cambia de identidad (los efectos que dependen de él releen) y
    // la lectura siguiente vuelve a la API.
    await waitFor(() => expect(result.current).not.toBe(before));
    expect(await result.current()).toEqual([clinicLocation(), tokyo]);
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('sin proveedor, invalidate no rompe y cada lectura ya es nueva', async () => {
    listLocationsMock.mockResolvedValue([clinicLocation()]);
    const { result } = renderHook(() => useSessionLocations('tok'));
    await result.current();
    act(() => result.current.invalidate());
    await result.current();
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });
});

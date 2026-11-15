import { act, renderHook } from '@testing-library/react';
import {
  PROBE_MS,
  currentlyOffline,
  onReconnect,
  reportNetworkFailure,
  reportNetworkSuccess,
  resetConnectivityForTests,
  useOffline,
} from './connectivity';

describe('conexión (DX-405)', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    jest.useFakeTimers();
    resetConnectivityForTests();
  });
  afterEach(() => {
    resetConnectivityForTests();
    jest.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('un fallo de red de la API la da por caída; una respuesta, por vuelta (y avisa del regreso)', () => {
    const back = jest.fn();
    const stop = onReconnect(back);
    const { result } = renderHook(() => useOffline());
    expect(result.current).toBe(false);
    act(() => reportNetworkFailure());
    expect(result.current).toBe(true);
    expect(currentlyOffline()).toBe(true);
    act(() => reportNetworkSuccess());
    expect(result.current).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    stop();
  });

  it('mientras está caída, sondea; la sonda que responde la cierra', async () => {
    const probe = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = probe as unknown as typeof fetch;
    act(() => reportNetworkFailure());
    await act(async () => {
      jest.advanceTimersByTime(PROBE_MS);
    });
    expect(probe).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ cache: 'no-store' }));
    expect(currentlyOffline()).toBe(false);
  });

  it('sin `fetch` (jsdom) la sonda se apaga sin lanzar', () => {
    // @ts-expect-error: simula un entorno sin fetch
    delete globalThis.fetch;
    act(() => reportNetworkFailure());
    expect(() => jest.advanceTimersByTime(PROBE_MS * 3)).not.toThrow();
  });

  it('los eventos del navegador: offline y online', () => {
    const { result } = renderHook(() => useOffline());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(false);
  });
});

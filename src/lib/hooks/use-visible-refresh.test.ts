import { renderHook } from '@testing-library/react';
import { startVisibleRefresh, useVisibleRefresh } from './use-visible-refresh';
import { reportNetworkFailure, reportNetworkSuccess, resetConnectivityForTests } from '@/lib/offline/connectivity';

let hidden = false;
function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
});

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  resetConnectivityForTests();
});

afterEach(() => {
  jest.useRealTimers();
  resetConnectivityForTests();
});

describe('useVisibleRefresh (DX-046)', () => {
  it('relee cada intervalo con la pestaña visible', () => {
    const refresh = jest.fn();
    renderHook(() => useVisibleRefresh(refresh, { intervalMs: 60_000 }));
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(59_999);
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('con la pestaña oculta el intervalo no relee; al volver a ella, sí', () => {
    const refresh = jest.fn();
    renderHook(() => useVisibleRefresh(refresh, { intervalMs: 60_000 }));
    setHidden(true);
    jest.advanceTimersByTime(180_000);
    expect(refresh).not.toHaveBeenCalled();
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ocultar la pestaña no relee (solo volver a ella)', () => {
    const refresh = jest.fn();
    renderHook(() => useVisibleRefresh(refresh, { intervalMs: 60_000 }));
    setHidden(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sin conexión no relee ni por el intervalo ni al volver a la pestaña', () => {
    const refresh = jest.fn();
    renderHook(() => useVisibleRefresh(refresh, { intervalMs: 60_000 }));
    reportNetworkFailure();
    jest.advanceTimersByTime(120_000);
    setHidden(true);
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
    reportNetworkSuccess();
    jest.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('enabled=false no arranca nada; desmontar lo para todo', () => {
    const refresh = jest.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useVisibleRefresh(refresh, { intervalMs: 60_000, enabled }),
      { initialProps: { enabled: false } },
    );
    jest.advanceTimersByTime(120_000);
    setHidden(true);
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
    rerender({ enabled: true });
    unmount();
    jest.advanceTimersByTime(120_000);
    setHidden(true);
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('llama siempre al `refresh` del último render', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ fn }) => useVisibleRefresh(fn, { intervalMs: 60_000 }), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    jest.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('startVisibleRefresh', () => {
  it('al volver a la pestaña solo relee si los datos tienen más de staleMs', () => {
    const refresh = jest.fn();
    let last = Date.now();
    const stop = startVisibleRefresh(refresh, { intervalMs: 45_000, staleMs: 15_000, lastLoadedAt: () => last });
    jest.advanceTimersByTime(5_000);
    setHidden(true);
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(11_000);
    setHidden(true);
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    last = Date.now();
    stop();
    jest.advanceTimersByTime(100_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

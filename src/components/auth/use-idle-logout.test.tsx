import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { forgetLastActivity, takeIdleLogout } from '@/lib/auth/idle-logout';
import { useIdleLogout } from './use-idle-logout';

jest.mock('../../lib/session/session-store', () => ({
  loadMe: jest.fn().mockResolvedValue({ sessionIdleMinutes: 15 }),
  clearSessionStore: jest.fn(),
}));
jest.mock('../../lib/offline/offline-agenda', () => ({ forgetOfflineSession: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../profile/user-menu', () => ({ revokeSession: jest.fn().mockResolvedValue(undefined) }));

const MINUTE = 60_000;
let clear: jest.SpyInstance;

describe('useIdleLogout (DX-137)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    forgetLastActivity();
    clear = jest.spyOn(useAuthStore.getState(), 'clear');
  });
  afterEach(() => {
    clear.mockRestore();
    jest.useRealTimers();
  });

  it('renovar el token no cuenta como actividad: a los 15 min sin uso se cierra', async () => {
    const { rerender } = renderHook(({ token }) => useIdleLogout(token), { initialProps: { token: 'tok-1' } });
    await act(async () => {
      await Promise.resolve(); // minutos de la clínica (15)
    });
    act(() => jest.advanceTimersByTime(10 * MINUTE));
    // Un sondeo en segundo plano renovó el access token.
    rerender({ token: 'tok-2' });
    act(() => jest.advanceTimersByTime(4 * MINUTE));
    expect(clear).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(MINUTE + 15_000));
    expect(clear).toHaveBeenCalled();
    expect(takeIdleLogout()).toBe(true);
  });

  it('si `/me` llega tarde, no cuenta como actividad', async () => {
    let resolveMe: (me: { sessionIdleMinutes: number }) => void = () => undefined;
    const { loadMe } = jest.requireMock('../../lib/session/session-store') as { loadMe: jest.Mock };
    loadMe.mockReturnValueOnce(new Promise((resolve) => (resolveMe = resolve)));
    renderHook(() => useIdleLogout('tok'));
    act(() => jest.advanceTimersByTime(14 * MINUTE));
    await act(async () => {
      resolveMe({ sessionIdleMinutes: 15 });
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(MINUTE + 15_000));
    expect(clear).toHaveBeenCalled();
  });

  it('tocar la pantalla en cualquier momento reinicia la cuenta', async () => {
    renderHook(() => useIdleLogout('tok'));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(14 * MINUTE));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });
    act(() => jest.advanceTimersByTime(14 * MINUTE));
    expect(clear).not.toHaveBeenCalled();
  });
});

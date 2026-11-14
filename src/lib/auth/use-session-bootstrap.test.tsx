import { renderHook } from '@testing-library/react';
import { clearSessionStore } from '@/lib/session/session-store';
import { useSessionBootstrap } from './use-session-bootstrap';
import { useAuthStore } from './auth-store';
import { SESSION_CHANNEL } from './session-channel';

jest.mock('../api/client', () => ({ bootstrapSession: jest.fn().mockResolvedValue(undefined) }));
import { bootstrapSession } from '../api/client';
jest.mock('../locations/locations-api', () => ({ listLocations: jest.fn() }));
import { listLocations } from '../locations/locations-api';
import { loadLocations } from '../session/session-store';
import { clinicLocation } from '../test/locations';

type Listener = ((event: { data: unknown }) => void) | null;
const channels: Array<{ name: string; onmessage: Listener; closed: boolean }> = [];

describe('useSessionBootstrap', () => {
  beforeEach(() => {
    channels.length = 0;
    (bootstrapSession as jest.Mock).mockClear();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
      onmessage: Listener = null;
      closed = false;
      constructor(public readonly name: string) {
        channels.push(this);
      }
      postMessage() {}
      close() {
        this.closed = true;
      }
    };
    useAuthStore.setState({ accessToken: 'A', _hasHydrated: true });
  });
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  it('arranca la sesión al montar', () => {
    renderHook(() => useSessionBootstrap());
    expect(bootstrapSession).toHaveBeenCalledTimes(1);
  });

  it('si otra pestaña cierra sesión, olvida el access token de esta', () => {
    renderHook(() => useSessionBootstrap());
    const [ch] = channels;
    expect(ch.name).toBe(SESSION_CHANNEL);

    ch.onmessage?.({ data: 'logout' });

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('FE-031: el cierre de sesión en otra pestaña vacía también la caché de sesión', async () => {
    jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
    renderHook(() => useSessionBootstrap());
    await loadLocations('A');
    await loadLocations('A');
    expect(listLocations).toHaveBeenCalledTimes(1);

    channels[0].onmessage?.({ data: 'logout' });

    // Al volver a entrar (aunque sea el mismo usuario), las sedes se leen de nuevo.
    useAuthStore.setState({ accessToken: 'A', _hasHydrated: true });
    await loadLocations('A');
    expect(listLocations).toHaveBeenCalledTimes(2);
  });

  it('deja de escuchar al desmontar', () => {
    const { unmount } = renderHook(() => useSessionBootstrap());
    unmount();
    clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
    expect(channels[0].closed).toBe(true);
  });
});

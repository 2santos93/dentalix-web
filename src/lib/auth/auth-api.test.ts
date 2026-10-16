import { logout } from './auth-api';
import { SESSION_CHANNEL } from './session-channel';

describe('auth-api logout', () => {
  const originalFetch = global.fetch;
  const posted: unknown[] = [];

  beforeEach(() => {
    posted.length = 0;
    // jsdom no trae BroadcastChannel: uno mínimo que registra lo publicado.
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
      constructor(public readonly name: string) {}
      postMessage(message: unknown) {
        posted.push({ name: this.name, message });
      }
      close() {}
    };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  it('POSTs /auth/logout sin token en el body: la API revoca y borra la cookie (DX-062)', async () => {
    // Mocked as a plain object (not `new Response(...)`) — this suite runs
    // under `jest-environment-jsdom`, which does not expose a global
    // `Response`; see the same convention in `client.test.ts`/`staff-api.test.ts`.
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    await logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('same-origin');
  });

  it('avisa a las demás pestañas del mismo host para que cierren su sesión en memoria', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }) as unknown as typeof fetch;

    await logout();

    expect(posted).toEqual([{ name: SESSION_CHANNEL, message: 'logout' }]);
  });

  it('never throws when the request fails (best-effort), y avisa igual', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(logout()).resolves.toBeUndefined();
    expect(posted).toHaveLength(1);
  });
});

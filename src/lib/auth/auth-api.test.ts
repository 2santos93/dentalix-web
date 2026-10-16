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

  it('avisa a las demás pestañas DESPUÉS de que la API revoque, no antes (si no, otra pestaña podría rotar la cookie en medio)', async () => {
    let postedWhenFetched = -1;
    global.fetch = jest.fn(async () => {
      postedWhenFetched = posted.length;
      return { ok: true, text: async () => '' };
    }) as unknown as typeof fetch;

    await logout();

    expect(postedWhenFetched).toBe(0);
    expect(posted).toHaveLength(1);
  });

  describe('con Web Locks', () => {
    afterEach(() => {
      delete (navigator as unknown as { locks?: unknown }).locks;
    });

    it('el logout espera al refresh en curso de otra pestaña (mismo lock dentalix-refresh): revoca la cookie YA rotada', async () => {
      const events: string[] = [];
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Un lock mínimo con exclusión real: la segunda petición espera a la primera.
      let tail: Promise<unknown> = Promise.resolve();
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: (name: string, cb: () => Promise<unknown>) => {
            events.push(`lock:${name}`);
            const run = tail.then(cb);
            tail = run.catch(() => undefined);
            return run;
          },
        },
      });
      global.fetch = jest.fn(async () => {
        events.push('fetch:logout');
        return { ok: true, text: async () => '' };
      }) as unknown as typeof fetch;

      // "Otra pestaña" (aquí, otra tarea) tiene el lock mientras rota la cookie.
      const otherRefresh = navigator.locks.request('dentalix-refresh', async () => {
        await held;
        events.push('refresh:done');
      });
      const out = logout();
      await Promise.resolve();
      expect(events).not.toContain('fetch:logout');
      release();
      await Promise.all([otherRefresh, out]);

      expect(events).toEqual([
        'lock:dentalix-refresh',
        'lock:dentalix-refresh',
        'refresh:done',
        'fetch:logout',
      ]);
    });
  });
});

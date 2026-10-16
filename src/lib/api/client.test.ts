/**
 * jsdom 26's `window.location` (and its `host` property) is a non-
 * configurable accessor — `Object.defineProperty`/`delete` on it throws
 * "Cannot redefine property", and assigning `window.location.host =` tries
 * to actually navigate (jsdom logs "Not implemented: navigation" and leaves
 * it unchanged). The one place Jest lets a test control the jsdom URL is
 * this per-file docblock pragma, so the whole suite below runs against a
 * fake tenant subdomain host — mirroring what a clinic's real host looks
 * like (e.g. `agendademo7z.localhost:3001`) — and the first test asserts
 * `doFetch` forwards exactly that host as `X-Tenant-Host`.
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://acme.localhost:3001"}
 */
import { apiFetch, apiFetchOrNull, ApiError, bootstrapSession, NetworkError } from './client';
import { useAuthStore } from '@/lib/auth/auth-store';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';

describe('apiFetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends bearer + X-Tenant-Host (from window.location.host) headers and returns parsed json', async () => {
    // The file-level `@jest-environment-options` docblock above points this
    // suite's jsdom at `http://acme.localhost:3001` — assert doFetch reads
    // that mocked host straight from `window.location.host`.
    expect(window.location.host).toBe('acme.localhost:3001');

    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    global.fetch = spy as unknown as typeof fetch;
    const out = await apiFetch<{ ok: number }>('/patients', { token: 'T' });
    expect(out).toEqual({ ok: 1 });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer T');
    expect(init.headers['X-Tenant-Host']).toBe('acme.localhost:3001');
    // The old dead header must NOT be sent — the backend never read it.
    expect(init.headers['X-Tenant']).toBeUndefined();
  });

  it('merges per-call opts.headers (e.g. Idempotency-Key) on top of the built-ins', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    global.fetch = spy as unknown as typeof fetch;

    await apiFetch('/treatment-plans/plan-1/payments', {
      method: 'POST',
      token: 'T',
      body: { amount: 100 },
      headers: { 'Idempotency-Key': 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
    });

    const [, init] = spy.mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd');
    // Built-in headers still present.
    expect(init.headers.Authorization).toBe('Bearer T');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws ApiError on non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'nope' }),
    }) as unknown as typeof fetch;
    // No refresh token in the store → a 401 cannot be recovered and bubbles.
    useAuthStore.getState().clear();
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiFetch — refresh por cookie (DX-062)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, _hasHydrated: false });
  });
  afterEach(() => {
    global.fetch = realFetch;
    localStorage.clear();
  });

  function ok(json: unknown, status = 200) {
    return { ok: true, status, json: async () => json, text: async () => JSON.stringify(json) };
  }
  function unauthorized(message = 'Invalid token') {
    return { ok: false, status: 401, json: async () => ({ message }) };
  }
  const path = (url: string) => url.replace(/^.*\/api\/v1/, '');

  it('va al MISMO origen (/api/v1), con la cookie (same-origin) y pidiendo el modo cookie', async () => {
    const spy = jest.fn().mockResolvedValue(ok({ ok: 1 }));
    global.fetch = spy as unknown as typeof fetch;

    await apiFetch('/patients', { token: 'T' });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/patients');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['X-Refresh-Transport']).toBe('cookie');
  });

  it('on 401, renueva con la cookie (sin refresh en el body) y repite la petición con el access nuevo', async () => {
    useAuthStore.getState().setAccessToken('OLD');

    const calls: Array<{ url: string; auth?: string; body?: unknown }> = [];
    let protectedHits = 0;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization, body: init.body });
      if (url.endsWith('/auth/refresh')) return ok({ accessToken: 'NEW' });
      protectedHits += 1;
      return protectedHits === 1 ? unauthorized() : ok({ items: [] });
    }) as unknown as typeof fetch;

    const out = await apiFetch<{ items: unknown[] }>('/patients', { token: 'OLD' });

    expect(out).toEqual({ items: [] });
    expect(calls.map((c) => path(c.url))).toEqual(['/patients', '/auth/refresh', '/patients']);
    // El refresh viaja en la cookie HttpOnly: el body no lleva ningún token.
    expect(calls[1].body).toBeUndefined();
    expect(calls[2].auth).toBe('Bearer NEW');
    expect(useAuthStore.getState().accessToken).toBe('NEW');
    expect(localStorage.length).toBe(0);
  });

  it('si la cookie tampoco vale (401), cierra la sesión en memoria y lanza', async () => {
    useAuthStore.getState().setAccessToken('OLD');
    global.fetch = jest.fn(async (url: string) =>
      url.endsWith('/auth/refresh') ? unauthorized('Invalid refresh token') : unauthorized(),
    ) as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('coalesces concurrent 401s into a single /auth/refresh (rotation-safe)', async () => {
    useAuthStore.getState().setAccessToken('OLD');

    let refreshCount = 0;
    const protectedHits: Record<string, number> = {};
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return ok({ accessToken: 'NEW' });
      }
      const key = path(url);
      protectedHits[key] = (protectedHits[key] ?? 0) + 1;
      return protectedHits[key] === 1 ? unauthorized() : ok({ ok: 1 });
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      apiFetch('/patients', { token: 'OLD' }),
      apiFetch('/appointments', { token: 'OLD' }),
      apiFetch('/staff', { token: 'OLD' }),
    ]);

    expect([a, b, c]).toEqual([{ ok: 1 }, { ok: 1 }, { ok: 1 }]);
    expect(refreshCount).toBe(1);
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'a 5xx',
      () => Promise.resolve({ ok: false, status: 503, json: async () => ({ message: 'down' }) }),
    ],
  ])('keeps the session when the refresh fails with %s (only a 401 logs out)', async (_label, refreshResponse) => {
    useAuthStore.getState().setAccessToken('OLD');
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return refreshResponse();
      return unauthorized();
    }) as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBe('OLD');
  });

  // La cookie la comparten todas las pestañas del host. Sin Web Locks, dos
  // pestañas pueden gastar la MISMA cookie a la vez: la que pierde (401) vuelve
  // a intentarlo una vez, ya con la cookie que dejó la ganadora.
  it('sin Web Locks, tras perder la carrera (401) reintenta una vez con la cookie ya rotada', async () => {
    useAuthStore.getState().setAccessToken('OLD');
    let refreshCount = 0;
    let protectedHits = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return refreshCount === 1 ? unauthorized('Invalid refresh token') : ok({ accessToken: 'NEW' });
      }
      protectedHits += 1;
      return protectedHits === 1 ? unauthorized() : ok({ ok: 1 });
    }) as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'OLD' })).resolves.toEqual({ ok: 1 });
    expect(refreshCount).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe('NEW');
  });

  describe('with Web Locks', () => {
    const lockNames: string[] = [];
    beforeEach(() => {
      lockNames.length = 0;
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: async (name: string, cb: () => Promise<unknown>) => {
            lockNames.push(name);
            return cb();
          },
        },
      });
    });
    afterEach(() => {
      delete (navigator as unknown as { locks?: unknown }).locks;
    });

    it('serializa el refresh entre pestañas bajo el lock dentalix-refresh', async () => {
      useAuthStore.getState().setAccessToken('OLD');
      let protectedHits = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (url.endsWith('/auth/refresh')) return ok({ accessToken: 'NEW' });
        protectedHits += 1;
        return protectedHits === 1 ? unauthorized() : ok({ ok: 1 });
      }) as unknown as typeof fetch;

      await apiFetch('/patients', { token: 'OLD' });

      expect(lockNames).toEqual(['dentalix-refresh']);
      expect(useAuthStore.getState().accessToken).toBe('NEW');
    });

    it('con el lock, un 401 del refresh es definitivo: no reintenta y cierra la sesión', async () => {
      useAuthStore.getState().setAccessToken('OLD');
      let refreshCount = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCount += 1;
          return unauthorized('Invalid refresh token');
        }
        return unauthorized();
      }) as unknown as typeof fetch;

      await expect(apiFetch('/patients', { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
      expect(refreshCount).toBe(1);
      expect(useAuthStore.getState().accessToken).toBeNull();
    });
  });

  it('does NOT refresh on a 401 from an /auth/* endpoint (wrong password is not an expired session)', async () => {
    let refreshCount = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return ok({ accessToken: 'NEW' });
      }
      return unauthorized('Invalid credentials');
    }) as unknown as typeof fetch;

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(refreshCount).toBe(0);
  });
});

describe('bootstrapSession — arranque de sesión al cargar la página (DX-062)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, _hasHydrated: false });
  });
  afterEach(() => {
    global.fetch = realFetch;
    localStorage.clear();
  });

  function ok(json: unknown) {
    return { ok: true, status: 201, json: async () => json };
  }

  it('con cookie válida: obtiene el access token y marca la sesión como resuelta', async () => {
    const spy = jest.fn().mockResolvedValue(ok({ accessToken: 'A1' }));
    global.fetch = spy as unknown as typeof fetch;

    await bootstrapSession();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/auth/refresh');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'A1', _hasHydrated: true });
  });

  it('sin cookie (401): queda resuelta SIN sesión (la página manda a /login)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Missing refresh token' }) }) as unknown as typeof fetch;

    await bootstrapSession();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, _hasHydrated: true });
  });

  it('una sola llamada aunque la pidan varios componentes a la vez, y ninguna si ya está resuelta', async () => {
    const spy = jest.fn().mockResolvedValue(ok({ accessToken: 'A1' }));
    global.fetch = spy as unknown as typeof fetch;

    await Promise.all([bootstrapSession(), bootstrapSession(), bootstrapSession()]);
    await bootstrapSession();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('migración: usa UNA vez el refresh antiguo de localStorage para obtener la cookie y borra el estado viejo', async () => {
    localStorage.setItem(
      'dentalix-auth',
      JSON.stringify({ state: { accessToken: 'VIEJO', refreshToken: 'R-VIEJO' }, version: 0 }),
    );
    const spy = jest.fn().mockResolvedValue(ok({ accessToken: 'A1' }));
    global.fetch = spy as unknown as typeof fetch;

    await bootstrapSession();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/auth/refresh');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'R-VIEJO' });
    expect(init.headers['X-Refresh-Transport']).toBe('cookie');
    expect(localStorage.getItem('dentalix-auth')).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('A1');
  });

  it('migración con un refresh antiguo ya muerto: lo borra y prueba con la cookie', async () => {
    localStorage.setItem(
      'dentalix-auth',
      JSON.stringify({ state: { accessToken: 'VIEJO', refreshToken: 'R-MUERTO' }, version: 0 }),
    );
    const bodies: unknown[] = [];
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      bodies.push(init.body);
      return bodies.length === 1
        ? { ok: false, status: 401, json: async () => ({ message: 'Invalid refresh token' }) }
        : ok({ accessToken: 'A-COOKIE' });
    }) as unknown as typeof fetch;

    await bootstrapSession();

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBeUndefined();
    expect(localStorage.getItem('dentalix-auth')).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('A-COOKIE');
  });

  it('migración: si la red falla, conserva el refresh antiguo para el siguiente intento', async () => {
    const legacy = JSON.stringify({ state: { refreshToken: 'R-VIEJO' }, version: 0 });
    localStorage.setItem('dentalix-auth', legacy);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    await bootstrapSession();

    expect(localStorage.getItem('dentalix-auth')).toBe(legacy);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, _hasHydrated: true });
  });

  it('un estado antiguo sin refresh (o corrupto) simplemente se borra', async () => {
    localStorage.setItem('dentalix-auth', '{no-json');
    const spy = jest.fn().mockResolvedValue(ok({ accessToken: 'A1' }));
    global.fetch = spy as unknown as typeof fetch;

    await bootstrapSession();

    expect(spy.mock.calls[0][1].body).toBeUndefined();
    expect(localStorage.getItem('dentalix-auth')).toBeNull();
  });
});

describe('apiFetchOrNull', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  // CRITICAL contract: GET /patients/:id/medical-history returns 200 with an
  // EMPTY body (content-length 0), NOT JSON `null`, when the patient has no
  // history yet. `apiFetch`'s `res.json()` would throw on that — this must
  // return `null` instead.
  it('returns null on a 200 response with an empty body (does not throw)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    }) as unknown as typeof fetch;

    await expect(apiFetchOrNull('/patients/1/medical-history')).resolves.toBeNull();
  });

  it('returns the parsed json when the body is non-empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: '1', version: 2 }),
    }) as unknown as typeof fetch;

    await expect(apiFetchOrNull('/patients/1/medical-history')).resolves.toEqual({
      id: '1',
      version: 2,
    });
  });

  it('throws ApiError on non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' }),
    }) as unknown as typeof fetch;
    await expect(apiFetchOrNull('/patients/1/medical-history')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiFetch — FormData body', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  // NOTE: this suite's jsdom environment (no per-file docblock override, see
  // the top-of-file pragma on the first `describe`) has no native `fetch` /
  // `Response` globals to `jest.spyOn` — same as every other test in this
  // file, we plain-assign `global.fetch` to a jest.fn() that resolves a
  // minimal fetch-shaped object.
  it('sends a FormData body without JSON content-type and without stringifying', async () => {
    useAuthStore.getState().setAccessToken('T');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');

    await apiFetch('/me/avatar', { method: 'POST', token: 'T', body: fd });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(fd);
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });
});

// La sede elegida vive en localStorage y sobrevive a la sede real: si se borra,
// se desactiva, o se reseedea la base y cambian los ids, queda un id huérfano
// que se sigue mandando como `X-Location-Id` en CADA petición — y el backend
// contesta 400 "Unknown location for this clinic" a TODAS, dejando la app
// inservible hasta que alguien limpia localStorage a mano.
//
// `LocationSwitcher` ya reconcilia contra la lista real, pero solo cuando está
// montado: las pantallas que piden datos sin él siguen fuera de su alcance. Así
// que el cliente se cura solo, en el único sitio por el que pasan todas.
describe('apiFetch — sede huérfana en localStorage', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    window.localStorage.clear();
  });

  const UNKNOWN = 'Unknown location for this clinic';
  function unknownLocation() {
    return { ok: false, status: 400, json: async () => ({ message: UNKNOWN }) };
  }
  function ok(json: unknown) {
    return { ok: true, status: 200, json: async () => json };
  }

  it('descarta la sede y reintenta UNA vez, ya sin la cabecera', async () => {
    setActiveLocationId('sede-borrada');
    let hits = 0;
    // Las cabeceras se recogen DENTRO del mock (misma convención que el test de
    // refresco de más arriba): así se leen tipadas sin declarar parámetros que
    // no se usan.
    const enviadas: Array<Record<string, string>> = [];
    const spy = jest.fn(async (url: string, init: RequestInit) => {
      enviadas.push(init.headers as Record<string, string>);
      hits += 1;
      return hits === 1 ? unknownLocation() : ok({ items: [1], url });
    });
    global.fetch = spy as unknown as typeof fetch;

    const out = await apiFetch<{ items: number[] }>('/patients', { token: 'T' });

    expect(out).toMatchObject({ items: [1] });
    expect(spy).toHaveBeenCalledTimes(2);
    // La primera llevaba la sede muerta; el reintento ya no manda la cabecera.
    expect(enviadas[0]['X-Location-Id']).toBe('sede-borrada');
    expect(enviadas[1]['X-Location-Id']).toBeUndefined();
    // Y queda limpia, para que las siguientes peticiones no repitan el 400.
    expect(getActiveLocationId()).toBeNull();
  });

  it('no reintenta en bucle: si el reintento también falla, lanza', async () => {
    setActiveLocationId('sede-borrada');
    const spy = jest.fn(async () => unknownLocation());
    global.fetch = spy as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'T' })).rejects.toThrow(UNKNOWN);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('otro 400 cualquiera NO toca la sede guardada', async () => {
    // Solo este mensaje concreto significa "tu sede no existe". Un 400 de
    // validación no debe sacar al usuario de su sede.
    setActiveLocationId('sede-viva');
    const spy = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'name should not be empty' }),
    }));
    global.fetch = spy as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'T' })).rejects.toThrow(
      'name should not be empty',
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getActiveLocationId()).toBe('sede-viva');
  });

  it('sin sede guardada no hay nada que curar: no reintenta', async () => {
    const spy = jest.fn(async () => unknownLocation());
    global.fetch = spy as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'T' })).rejects.toThrow(UNKNOWN);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('apiFetchOrNull se cura igual', async () => {
    setActiveLocationId('sede-borrada');
    let hits = 0;
    const spy = jest.fn(async () => {
      hits += 1;
      return hits === 1
        ? unknownLocation()
        : { ok: true, status: 200, text: async () => JSON.stringify({ a: 1 }) };
    });
    global.fetch = spy as unknown as typeof fetch;

    await expect(apiFetchOrNull<{ a: number }>('/x', { token: 'T' })).resolves.toEqual({
      a: 1,
    });
    expect(getActiveLocationId()).toBeNull();
  });
});

describe('apiFetch — cuerpo de error (DX-063)', () => {
  const realFetch = global.fetch;
  beforeEach(() => useAuthStore.getState().clear());
  afterEach(() => {
    global.fetch = realFetch;
  });

  async function caught(): Promise<ApiError> {
    try {
      await apiFetch('/auth/x');
    } catch (err) {
      return err as ApiError;
    }
    throw new Error('apiFetch no falló');
  }

  it('guarda el array de class-validator en `messages`', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ statusCode: 400, message: ['a debe ser texto', 'b es obligatorio'] }),
    }) as unknown as typeof fetch;
    const err = await caught();
    expect(err.status).toBe(400);
    expect(err.messages).toEqual(['a debe ser texto', 'b es obligatorio']);
  });

  it('sin cuerpo JSON no inventa «Request failed»: messages vacío', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;
    const err = await caught();
    expect(err.messages).toEqual([]);
    expect(err.message).not.toMatch(/Request failed/);
  });

  it('lee Retry-After de un 429', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '42' }),
      json: async () => ({ message: 'ThrottlerException: Too Many Requests' }),
    }) as unknown as typeof fetch;
    const err = await caught();
    expect(err.retryAfterSeconds).toBe(42);
  });
});

// Revisión D-2: solo un fallo del propio `fetch` es «sin conexión».
describe('apiFetch — fallo de red (DX-063)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('un rechazo de fetch se relanza como NetworkError, con la causa', async () => {
    const cause = new TypeError('Failed to fetch');
    global.fetch = jest.fn().mockRejectedValue(cause) as unknown as typeof fetch;
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).cause).toBe(cause);
  });

  it('un AbortError o TimeoutError pasa tal cual', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    global.fetch = jest.fn().mockRejectedValue(abort) as unknown as typeof fetch;
    await expect(apiFetch('/x')).rejects.toBe(abort);
    const timeout = new DOMException('timed out', 'TimeoutError');
    global.fetch = jest.fn().mockRejectedValue(timeout) as unknown as typeof fetch;
    await expect(apiFetch('/x')).rejects.toBe(timeout);
  });
});

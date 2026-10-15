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
import { apiFetch, apiFetchOrNull, ApiError } from './client';
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

describe('apiFetch — expired access token refresh', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    useAuthStore.getState().clear();
  });

  function ok(json: unknown, status = 200) {
    return { ok: true, status, json: async () => json, text: async () => JSON.stringify(json) };
  }
  function unauthorized(message = 'Invalid token') {
    return { ok: false, status: 401, json: async () => ({ message }) };
  }

  it('on 401, refreshes with the stored refresh token and replays the request with the new access token', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R' });

    const calls: Array<{ url: string; auth?: string; body?: string }> = [];
    let protectedHits = 0;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization, body: init.body as string });
      if (url.endsWith('/auth/refresh')) {
        return ok({ accessToken: 'NEW', refreshToken: 'R2' });
      }
      // First hit: expired token → 401. After refresh: succeeds.
      protectedHits += 1;
      return protectedHits === 1 ? unauthorized() : ok({ items: [] });
    }) as unknown as typeof fetch;

    const out = await apiFetch<{ items: unknown[] }>('/patients', { token: 'OLD' });

    expect(out).toEqual({ items: [] });
    // 3 calls: protected(401) → refresh → protected(200).
    expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual([
      '/patients',
      '/auth/refresh',
      '/patients',
    ]);
    // The refresh POST carried the stored refresh token.
    expect(JSON.parse(calls[1].body!)).toEqual({ refreshToken: 'R' });
    // The replay used the freshly-minted access token, not the stale one.
    expect(calls[2].auth).toBe('Bearer NEW');
    // Store was updated with the rotated pair.
    expect(useAuthStore.getState().accessToken).toBe('NEW');
    expect(useAuthStore.getState().refreshToken).toBe('R2');
  });

  it('clears the session and throws when the refresh token is also dead', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'DEAD' });

    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return unauthorized('Invalid refresh token');
      return unauthorized();
    }) as unknown as typeof fetch;

    await expect(apiFetch('/patients', { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
    // Store cleared → the page's `accessToken` guard bounces the user to /login.
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('coalesces concurrent 401s into a single /auth/refresh (rotation-safe)', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R' });

    let refreshCount = 0;
    const protectedHits: Record<string, number> = {};
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return ok({ accessToken: 'NEW', refreshToken: 'R2' });
      }
      const key = url.replace(/^.*\/api\/v1/, '');
      protectedHits[key] = (protectedHits[key] ?? 0) + 1;
      return protectedHits[key] === 1 ? unauthorized() : ok({ ok: 1 });
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      apiFetch('/patients', { token: 'OLD' }),
      apiFetch('/appointments', { token: 'OLD' }),
      apiFetch('/staff', { token: 'OLD' }),
    ]);

    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 1 });
    expect(c).toEqual({ ok: 1 });
    expect(refreshCount).toBe(1);
  });

  // El backend hace los refresh tokens de UN SOLO USO: reusar uno ya rotado
  // es 401. Con varias pestañas abiertas, cada una tiene el par en memoria y
  // solo comparten localStorage; si otra pestaña ya rotó, esta debe adoptar el
  // par nuevo en vez de gastar el viejo (y cerrar la sesión de todas).
  function writePersistedPair(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(
      'dentalix-auth',
      JSON.stringify({ state: { accessToken, refreshToken }, version: 0 }),
    );
  }

  it('adopts a pair already rotated by another tab instead of reusing the stale refresh token', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R' });
    // Otra pestaña rotó: localStorage tiene el par nuevo, la memoria no.
    writePersistedPair('NEW-OTHER-TAB', 'R2');

    const calls: Array<{ url: string; auth?: string }> = [];
    let protectedHits = 0;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization });
      if (url.endsWith('/auth/refresh')) return unauthorized('Invalid refresh token');
      protectedHits += 1;
      return protectedHits === 1 ? unauthorized() : ok({ ok: 1 });
    }) as unknown as typeof fetch;

    const out = await apiFetch('/patients', { token: 'OLD' });

    expect(out).toEqual({ ok: 1 });
    expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual([
      '/patients',
      '/patients',
    ]);
    expect(calls[1].auth).toBe('Bearer NEW-OTHER-TAB');
    expect(useAuthStore.getState().refreshToken).toBe('R2');
  });

  it('when another tab wins the refresh race, adopts its pair instead of logging out', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R' });
    writePersistedPair('OLD', 'R');

    let protectedHits = 0;
    const auths: Array<string | undefined> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        // Mientras esta petición viajaba, la otra pestaña consumió `R` y
        // guardó su par: el backend rechaza el reuso.
        writePersistedPair('NEW-OTHER-TAB', 'R2');
        return unauthorized('Invalid refresh token');
      }
      auths.push((init.headers as Record<string, string>).Authorization);
      protectedHits += 1;
      return protectedHits === 1 ? unauthorized() : ok({ ok: 1 });
    }) as unknown as typeof fetch;

    const out = await apiFetch('/patients', { token: 'OLD' });

    expect(out).toEqual({ ok: 1 });
    expect(auths[1]).toBe('Bearer NEW-OTHER-TAB');
    expect(useAuthStore.getState().accessToken).toBe('NEW-OTHER-TAB');
    expect(useAuthStore.getState().refreshToken).toBe('R2');
  });

  it('does NOT refresh on a 401 from an /auth/* endpoint (wrong password is not an expired session)', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R' });

    let refreshCount = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return ok({ accessToken: 'NEW', refreshToken: 'R2' });
      }
      return unauthorized('Invalid credentials');
    }) as unknown as typeof fetch;

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(refreshCount).toBe(0);
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
    useAuthStore.getState().setTokens({ accessToken: 'T', refreshToken: 'R' });
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

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

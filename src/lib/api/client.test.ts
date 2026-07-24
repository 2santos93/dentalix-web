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
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
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

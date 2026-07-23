import { apiFetch, apiFetchOrNull, ApiError } from './client';

describe('apiFetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends bearer + tenant headers and returns parsed json', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    global.fetch = spy as unknown as typeof fetch;
    const out = await apiFetch<{ ok: number }>('/patients', { token: 'T', tenant: 'sonrisa' });
    expect(out).toEqual({ ok: 1 });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer T');
    expect(init.headers['X-Tenant']).toBe('sonrisa');
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

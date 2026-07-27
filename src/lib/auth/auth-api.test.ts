import { logout } from './auth-api';

describe('auth-api logout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the refresh token to /auth/logout', async () => {
    // Mocked as a plain object (not `new Response(...)`) — this suite runs
    // under `jest-environment-jsdom`, which does not expose a global
    // `Response`; see the same convention in `client.test.ts`/`staff-api.test.ts`.
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => null });
    global.fetch = fetchMock as unknown as typeof fetch;

    await logout('ref-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/logout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'ref-123' });
  });

  it('never throws when the request fails (best-effort)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(logout('ref-123')).resolves.toBeUndefined();
  });
});

import { forgetServerBranding } from './branding-cache-client';

describe('forgetServerBranding (DX-517-ter)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POST al mismo origen, sin host ni cuerpo', async () => {
    const spy = jest.fn().mockResolvedValue({ status: 204 });
    global.fetch = spy as unknown as typeof fetch;
    await forgetServerBranding();
    expect(spy).toHaveBeenCalledWith('/api/branding-cache', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('nunca lanza (la caché caduca sola en 30 s)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch;
    await expect(forgetServerBranding()).resolves.toBeUndefined();
  });
});

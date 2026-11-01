import { fetchBranding } from './branding';

describe('fetchBranding', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns nulls when there is no tenant (no fetch)', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchBranding(null)).toEqual({ primaryColor: null, name: null, logoUrl: null, currencyTexts: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns nulls (fail-soft) when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchBranding('sonrisa')).toEqual({ primaryColor: null, name: null, logoUrl: null, currencyTexts: null });
  });

  it('maps the branding payload on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryColor: '#7C3AED', name: 'Sonrisa' }),
    }) as unknown as typeof fetch;
    expect(await fetchBranding('sonrisa')).toEqual({ primaryColor: '#7C3AED', name: 'Sonrisa', logoUrl: null, currencyTexts: {} });
  });

  it('rejects an invalid/malicious primaryColor and nulls it out (CSS-injection defense)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryColor: 'red};body{display:none', name: 'Sonrisa' }),
    }) as unknown as typeof fetch;
    expect(await fetchBranding('sonrisa')).toEqual({ primaryColor: null, name: 'Sonrisa', logoUrl: null, currencyTexts: {} });
  });

  it('keeps an http(s) logoUrl and drops any other scheme', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryColor: '#0E7490', name: 'Sonrisa', logoUrl: 'https://cdn.example/logo.png' }),
    }) as unknown as typeof fetch;
    expect((await fetchBranding('sonrisa')).logoUrl).toBe('https://cdn.example/logo.png');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Sonrisa', logoUrl: 'javascript:alert(1)' }),
    }) as unknown as typeof fetch;
    expect((await fetchBranding('sonrisa')).logoUrl).toBeNull();
  });

  it('forwards the request host as X-Tenant-Host (the API resolves by host first)', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Clínica Demo' }) });
    global.fetch = spy as unknown as typeof fetch;
    await fetchBranding('demo', 'demo.localhost:3001');
    expect(spy.mock.calls[0][1].headers).toEqual({ 'X-Tenant': 'demo', 'X-Tenant-Host': 'demo.localhost:3001' });
  });

  it('DX-517: keeps only ISO codes with a valid currency text (data crossing a trust boundary)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Sonrisa',
        currencyTexts: { EUR: '€', usd: 'US$', GBP: '', JPY: 'x'.repeat(9), CHF: 'Fr\n', AUD: 7 },
      }),
    }) as unknown as typeof fetch;
    expect((await fetchBranding('sonrisa')).currencyTexts).toEqual({ EUR: '€' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ currencyTexts: ['EUR'] }) }) as unknown as typeof fetch;
    expect((await fetchBranding('sonrisa')).currencyTexts).toEqual({});
  });
});

import { fetchBranding } from './branding';

describe('fetchBranding', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns nulls when there is no tenant (no fetch)', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchBranding(null)).toEqual({ primaryColor: null, name: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns nulls (fail-soft) when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchBranding('sonrisa')).toEqual({ primaryColor: null, name: null });
  });

  it('maps the branding payload on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryColor: '#7C3AED', name: 'Sonrisa' }),
    }) as unknown as typeof fetch;
    expect(await fetchBranding('sonrisa')).toEqual({ primaryColor: '#7C3AED', name: 'Sonrisa' });
  });
});

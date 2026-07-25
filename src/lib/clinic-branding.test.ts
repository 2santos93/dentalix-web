import { fetchClinicName } from './clinic-branding';

describe('fetchClinicName', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends X-Tenant-Host resolved from window.location.host (unlike fetchBranding\'s X-Tenant)', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Sonrisa' }) });
    global.fetch = spy as unknown as typeof fetch;

    expect(await fetchClinicName()).toBe('Sonrisa');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/public/tenant/branding'),
      expect.objectContaining({ headers: { 'X-Tenant-Host': window.location.host } }),
    );
  });

  it('fails soft to null when the request is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchClinicName()).toBeNull();
  });

  it('fails soft to null when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    expect(await fetchClinicName()).toBeNull();
  });

  it('falls back to null when the payload has no name', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchClinicName()).toBeNull();
  });
});

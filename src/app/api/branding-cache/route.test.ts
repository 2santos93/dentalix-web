/** @jest-environment node */
import { POST } from './route';
import { forgetBrandingForHost } from '@/lib/branding';

jest.mock('../../../lib/branding', () => ({ forgetBrandingForHost: jest.fn() }));
const forget = jest.mocked(forgetBrandingForHost);

function post(headers: Record<string, string>, url = 'http://avila.dentalix.app/api/branding-cache'): Request {
  return new Request(url, { method: 'POST', headers });
}

beforeEach(() => forget.mockReset());

describe('POST /api/branding-cache (DX-517-ter)', () => {
  it('mismo origen: olvida la marca del host de la PETICIÓN y responde 204 sin cuerpo y sin caché', async () => {
    const res = POST(post({ host: 'avila.dentalix.app', origin: 'http://avila.dentalix.app', 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(forget).toHaveBeenCalledTimes(1);
    expect(forget).toHaveBeenCalledWith('avila.dentalix.app');
  });

  it('con puerto (local y CI) y sin Sec-Fetch-Site (navegador antiguo): basta el Origin del mismo host', async () => {
    const res = POST(post({ host: 'avila.localhost:3001', origin: 'http://avila.localhost:3001' }));
    expect(res.status).toBe(204);
    expect(forget).toHaveBeenCalledWith('avila.localhost:3001');
  });

  it('no admite elegir otro host: ni query, ni cuerpo, ni X-Forwarded-Host, ni X-Tenant-Host', async () => {
    const req = new Request('http://avila.dentalix.app/api/branding-cache?host=norte.dentalix.app', {
      method: 'POST',
      headers: {
        host: 'avila.dentalix.app',
        origin: 'http://avila.dentalix.app',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-host': 'norte.dentalix.app',
        'x-tenant-host': 'norte.dentalix.app',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ host: 'norte.dentalix.app' }),
    });
    expect(POST(req).status).toBe(204);
    expect(forget.mock.calls).toEqual([['avila.dentalix.app']]);
  });

  it.each([
    ['otro origen', { origin: 'http://norte.dentalix.app', 'sec-fetch-site': 'same-site' }],
    ['otro origen aunque diga same-origin', { origin: 'http://norte.dentalix.app', 'sec-fetch-site': 'same-origin' }],
    ['sitio ajeno', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }],
    ['mismo Origin pero Sec-Fetch-Site cross-site', { origin: 'http://avila.dentalix.app', 'sec-fetch-site': 'cross-site' }],
    ['mismo Origin pero Sec-Fetch-Site same-site', { origin: 'http://avila.dentalix.app', 'sec-fetch-site': 'same-site' }],
    ['navegación directa (none)', { origin: 'http://avila.dentalix.app', 'sec-fetch-site': 'none' }],
    ['sin Origin', { 'sec-fetch-site': 'same-origin' }],
    ['Origin null', { origin: 'null', 'sec-fetch-site': 'same-origin' }],
    ['Origin mal formado', { origin: 'avila.dentalix.app' }],
    ['Origin con otro puerto', { origin: 'http://avila.dentalix.app:8080' }],
  ])('%s: 403 sin cuerpo y sin tocar la caché', async (_label, headers) => {
    const res = POST(post({ host: 'avila.dentalix.app', ...headers }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(forget).not.toHaveBeenCalled();
  });

  it('sin Host: 403', async () => {
    const res = POST(post({ origin: 'http://avila.dentalix.app', 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(403);
    expect(forget).not.toHaveBeenCalled();
  });

  it('solo exporta POST (GET, PUT… responden 405 de Next)', async () => {
    const mod = await import('./route');
    expect(Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
  });
});

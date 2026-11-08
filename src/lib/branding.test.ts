/** @jest-environment node */
import {
  BRANDING_CACHE_MAX_ENTRIES,
  BRANDING_FETCH_TIMEOUT_MS,
  brandingHostKey,
  fetchBrandingForHost,
  resetBrandingCacheForTests,
} from './branding';
import { clinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';

const API = 'http://api.test/api/v1';

type FetchMock = jest.Mock<Promise<Partial<Response>>, [URL | string, RequestInit?]>;

function ok(body: unknown): Partial<Response> {
  return { ok: true, status: 200, json: async () => body };
}
function status(code: number): Partial<Response> {
  return { ok: false, status: code, json: async () => ({ statusCode: code }) };
}

const AVILA = {
  name: 'Clínica Ávila',
  primaryColor: '#0E7490',
  logoUrl: 'https://cdn.example/avila.png',
  currencyTexts: { USD: 'US$', VES: 'Bs.' },
};
const NORTE = { name: 'Clínica Norte', primaryColor: '#6D28D9', logoUrl: null, currencyTexts: {} };

/** `fetch` que contesta por el `host` del query (como la API by-host). */
function apiByHost(brands: Record<string, unknown>): FetchMock {
  return jest.fn(async (input: URL | string) => {
    const host = new URL(String(input)).searchParams.get('host') ?? '';
    return host in brands ? ok(brands[host]) : status(404);
  });
}

let fetchMock: FetchMock;
const realFetch = global.fetch;
const NONE = { status: 'none', primaryColor: null, name: null, logoUrl: null, currencyTexts: null };
const UNKNOWN = { ...NONE, status: 'unknown' };

beforeEach(() => {
  process.env.API_URL = API;
  resetBrandingCacheForTests();
  fetchMock = apiByHost({ 'avila.dentalix.app': AVILA, 'norte.dentalix.app': NORTE, 'clinica-avila.com.ve': AVILA });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete process.env.API_URL;
});

describe('fetchBrandingForHost (DX-517-ter)', () => {
  describe('estados', () => {
    it('200 → clinic, con la marca validada', async () => {
      expect(await fetchBrandingForHost('avila.dentalix.app')).toEqual({ status: 'clinic', ...AVILA });
    });

    it('404 → none', async () => {
      expect(await fetchBrandingForHost('nadie.dentalix.app')).toEqual(NONE);
    });

    it.each([429, 500, 502, 503])('%i → unknown', async (code) => {
      fetchMock.mockResolvedValue(status(code));
      expect(await fetchBrandingForHost('avila.dentalix.app')).toEqual(UNKNOWN);
    });

    it('error de red → unknown', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      expect(await fetchBrandingForHost('avila.dentalix.app')).toEqual(UNKNOWN);
    });

    it('un cuerpo que no es JSON → unknown', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
      expect(await fetchBrandingForHost('avila.dentalix.app')).toEqual(UNKNOWN);
    });

    it(`timeout de ${BRANDING_FETCH_TIMEOUT_MS} ms → unknown (la petición se aborta)`, async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const pending = fetchBrandingForHost('avila.dentalix.app');
      await jest.advanceTimersByTimeAsync(BRANDING_FETCH_TIMEOUT_MS - 1);
      expect(signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      expect(await pending).toEqual(UNKNOWN);
    });
  });

  describe('la petición', () => {
    it('va a la ruta by-host de API_URL, sin caché de fetch, con el host en el query y sin cabeceras de clínica', async () => {
      await fetchBrandingForHost('Avila.Dentalix.APP:3001');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [input, init] = fetchMock.mock.calls[0];
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe(`${API}/public/tenant/branding/by-host`);
      expect([...url.searchParams.entries()]).toEqual([['host', 'avila.dentalix.app']]);
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeDefined();
      expect(init?.headers).toBeUndefined();
    });

    it.each([
      'demo.localhost&host=avila.dentalix.app',
      'demo.localhost#x',
      'demo.localhost/../../admin',
      'demo.localhost?host=x',
      'a..b',
      'demo.dentalix.app:443@evil.com',
      'demo.localhost%00',
      `${'a'.repeat(300)}.com`,
      '',
    ])('un host inválido (%p) no llega a la API: none sin fetch', async (host) => {
      expect(await fetchBrandingForHost(host)).toEqual(NONE);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([null, undefined])('sin host (%p): none sin fetch', async (host) => {
      expect(await fetchBrandingForHost(host)).toEqual(NONE);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['localhost:3001', '127.0.0.1:3001', 'dentalix.local', 'www.dentalix.local'])(
      'host de la plataforma (%p): none sin fetch',
      async (host) => {
        expect(await fetchBrandingForHost(host)).toEqual(NONE);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('validación de la marca (dato de la clínica que cruza una frontera)', () => {
    it('un primaryColor que no es hexadecimal se descarta (inyección de CSS)', async () => {
      fetchMock.mockResolvedValue(ok({ ...AVILA, primaryColor: 'red};body{display:none' }));
      const b = await fetchBrandingForHost('avila.dentalix.app');
      expect(b.status).toBe('clinic');
      expect(b.primaryColor).toBeNull();
    });

    it('un logo que no es http(s) se descarta', async () => {
      fetchMock.mockResolvedValue(ok({ ...AVILA, logoUrl: 'javascript:alert(1)' }));
      expect((await fetchBrandingForHost('avila.dentalix.app')).logoUrl).toBeNull();
    });

    it('el nombre con caracteres de HTML se devuelve como texto (React lo escapa)', async () => {
      const name = '</style><script>alert(1)</script>';
      fetchMock.mockResolvedValue(ok({ ...AVILA, name }));
      expect((await fetchBrandingForHost('avila.dentalix.app')).name).toBe(name);
    });

    it('solo códigos ISO con un texto válido', async () => {
      fetchMock.mockResolvedValue(
        ok({ ...AVILA, currencyTexts: { VES: 'Bs.', usd: 'US$', GBP: '', JPY: 'x'.repeat(9), CHF: 'Fr\n', AUD: 7 } }),
      );
      expect((await fetchBrandingForHost('avila.dentalix.app')).currencyTexts).toEqual({ VES: 'Bs.' });
    });

    it('nunca fija los textos de moneda del módulo en el servidor (estado compartido entre clínicas)', async () => {
      await fetchBrandingForHost('avila.dentalix.app');
      expect(clinicCurrencyTexts()).toEqual({});
    });
  });

  describe('caché en memoria por host', () => {
    it('A, B, A, B intercalados: nunca la marca de A para B ni al revés', async () => {
      const seq = ['avila.dentalix.app', 'norte.dentalix.app', 'avila.dentalix.app', 'norte.dentalix.app'];
      const names = [];
      for (const host of seq) names.push((await fetchBrandingForHost(host)).name);
      expect(names).toEqual(['Clínica Ávila', 'Clínica Norte', 'Clínica Ávila', 'Clínica Norte']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('A y B a la vez (concurrentes): cada una la suya', async () => {
      const [a, b, a2, b2] = await Promise.all([
        fetchBrandingForHost('avila.dentalix.app'),
        fetchBrandingForHost('norte.dentalix.app'),
        fetchBrandingForHost('avila.dentalix.app'),
        fetchBrandingForHost('norte.dentalix.app'),
      ]);
      expect([a.name, b.name, a2.name, b2.name]).toEqual(['Clínica Ávila', 'Clínica Norte', 'Clínica Ávila', 'Clínica Norte']);
    });

    it('dos hosts que solo difieren en el puerto, el caso o un punto final comparten entrada', async () => {
      await fetchBrandingForHost('avila.dentalix.app');
      await fetchBrandingForHost('avila.dentalix.app:3001');
      await fetchBrandingForHost('AVILA.Dentalix.app');
      await fetchBrandingForHost('avila.dentalix.app.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(brandingHostKey('AVILA.Dentalix.app.:443')).toBe('avila.dentalix.app');
    });

    it('clinic dura 30 s', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await fetchBrandingForHost('avila.dentalix.app');
      now.mockReturnValue(1_000_000 + 29_999);
      await fetchBrandingForHost('avila.dentalix.app');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 30_000);
      await fetchBrandingForHost('avila.dentalix.app');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('none dura 60 s y luego caduca', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await fetchBrandingForHost('nadie.dentalix.app');
      now.mockReturnValue(1_000_000 + 59_999);
      await fetchBrandingForHost('nadie.dentalix.app');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 60_000);
      await fetchBrandingForHost('nadie.dentalix.app');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('unknown nunca se guarda: la siguiente petición vuelve a preguntar', async () => {
      fetchMock.mockResolvedValueOnce(status(503));
      expect((await fetchBrandingForHost('avila.dentalix.app')).status).toBe('unknown');
      expect(await fetchBrandingForHost('avila.dentalix.app')).toEqual({ status: 'clinic', ...AVILA });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('dos llamadas concurrentes al mismo host hacen UN fetch', async () => {
      let release: (r: Partial<Response>) => void = () => {};
      fetchMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
      const p1 = fetchBrandingForHost('avila.dentalix.app');
      const p2 = fetchBrandingForHost('AVILA.dentalix.app:443');
      release(ok(AVILA));
      expect((await p1).name).toBe('Clínica Ávila');
      expect((await p2).name).toBe('Clínica Ávila');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lo guardado es inmutable: mutar un resultado no cambia el de la siguiente petición', async () => {
      const first = await fetchBrandingForHost('avila.dentalix.app');
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.currencyTexts)).toBe(true);
      expect(() => {
        (first as { name: string | null }).name = 'Otra';
      }).toThrow(TypeError);
      expect((await fetchBrandingForHost('avila.dentalix.app')).name).toBe('Clínica Ávila');
    });

    it(`acotada a ${BRANDING_CACHE_MAX_ENTRIES} hosts: el más antiguo sale`, async () => {
      fetchMock.mockImplementation(async () => status(404));
      await fetchBrandingForHost('h0.dentalix.app');
      for (let i = 1; i <= BRANDING_CACHE_MAX_ENTRIES; i++) await fetchBrandingForHost(`h${i}.dentalix.app`);
      const before = fetchMock.mock.calls.length;
      await fetchBrandingForHost(`h${BRANDING_CACHE_MAX_ENTRIES}.dentalix.app`);
      expect(fetchMock.mock.calls.length).toBe(before);
      await fetchBrandingForHost('h0.dentalix.app');
      expect(fetchMock.mock.calls.length).toBe(before + 1);
    });
  });
});

/**
 * Mockea el `fetch` base (mismo enfoque que receivables-api.test.ts) y
 * comprueba la ruta, la query y la cabecera de sede del saldo a favor (DX-430).
 */
import { getCreditBalances } from './credit-balances-api';

describe('credit-balances-api (DX-430)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    window.localStorage.clear();
  });

  function mockFetch() {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /receivables/credit-balances sin query cuando no hay filtros', async () => {
    const spy = mockFetch();
    await getCreditBalances('tok');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/receivables\/credit-balances$/);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('manda la página y la moneda, y la sede activa como cabecera', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-norte');
    const spy = mockFetch();
    await getCreditBalances('tok', { page: 2, pageSize: 25, currency: 'USD' });
    const [url, init] = spy.mock.calls[0];
    expect(Object.fromEntries(new URL(String(url), 'http://x').searchParams)).toEqual({
      currency: 'USD',
      page: '2',
      pageSize: '25',
    });
    expect(init.headers['X-Location-Id']).toBe('loc-norte');
  });
});

/**
 * Mockea el `fetch` base (mismo enfoque que inventory-api.test.ts) y comprueba
 * la ruta y la query que arma `listCashPayments`.
 */
import { listCashPayments } from './payments-api';

describe('listCashPayments', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    window.localStorage.clear();
  });

  function mockFetch() {
    const body = { items: [], total: 0, page: 1, pageSize: 20 };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /payments con el período, sin mandar los filtros ausentes', async () => {
    const spy = mockFetch();

    await listCashPayments('tok', { from: '2026-10-01', to: '2026-10-31' });

    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://x');
    expect(parsed.pathname).toMatch(/\/payments$/);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('añade método y página cuando vienen, y la sede activa como cabecera', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-2');
    const spy = mockFetch();

    await listCashPayments('tok', {
      from: '2026-10-15',
      to: '2026-10-15',
      method: 'CASH',
      page: 2,
    });

    const [url, init] = spy.mock.calls[0];
    expect(Object.fromEntries(new URL(String(url), 'http://x').searchParams)).toEqual({
      from: '2026-10-15',
      to: '2026-10-15',
      method: 'CASH',
      page: '2',
    });
    expect(init.headers['X-Location-Id']).toBe('loc-2');
  });
});

/**
 * Mocks the base `fetch` (same approach as `src/lib/api/client.test.ts` /
 * `src/lib/staff/staff-api.test.ts`) and asserts `getExchangeRates` hits the
 * right path/query/payload.
 */
import { getExchangeRates } from './exchange-api';

describe('exchange-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('getExchangeRates: GET /exchange/rates with an explicit date', async () => {
    const body = { base: 'USD', rates: { VES: 4000, EUR: 0.92 } };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    const out = await getExchangeRates('tok', '2026-07-01');

    expect(out).toEqual(body);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/exchange\/rates\?date=2026-07-01$/);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  // DX-384: las monedas con que se va a convertir, para la última tasa registrada.
  it('getExchangeRates: con monedas, las manda separadas por comas', async () => {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rateDate: '2026-10-30' }),
    });
    global.fetch = spy as unknown as typeof fetch;

    await getExchangeRates('tok', '2026-10-31', ['VES', 'USD']);

    expect(String(spy.mock.calls[0][0])).toMatch(/\/exchange\/rates\?date=2026-10-31&currencies=VES%2CUSD$/);
  });

  it('getExchangeRates: sin monedas no manda el parámetro', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = spy as unknown as typeof fetch;

    await getExchangeRates('tok', '2026-10-31', []);

    expect(String(spy.mock.calls[0][0])).not.toContain('currencies');
  });
});

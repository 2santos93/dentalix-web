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
    const body = { base: 'USD', rates: { COP: 4000, EUR: 0.92 } };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    const out = await getExchangeRates('tok', '2026-07-01');

    expect(out).toEqual(body);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/exchange\/rates\?date=2026-07-01$/);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('getExchangeRates: defaults the "date" query param to today (local) when omitted', async () => {
    const body = { base: 'USD', rates: { COP: 4000 } };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    await getExchangeRates('tok');

    const [url] = spy.mock.calls[0];
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    expect(String(url)).toContain(`date=${yyyy}-${mm}-${dd}`);
  });
});

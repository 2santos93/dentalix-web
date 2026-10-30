/**
 * DX-380: el aviso de abonos sin tasa de más de 24 h (solo ADMIN). Mockea el
 * `fetch` base, como payments-api.test.ts.
 */
import { canSeeRateBacklog, getRateBacklog, getRateBacklogDay } from './rate-backlog-api';

describe('rate-backlog-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('GET /payments/rate-backlog con el token', async () => {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 2, oldestSince: '2026-10-28T14:05:00.000Z' }),
    });
    global.fetch = spy as unknown as typeof fetch;

    await expect(getRateBacklog('tok')).resolves.toEqual({
      count: 2,
      oldestSince: '2026-10-28T14:05:00.000Z',
    });
    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/rate-backlog$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('DX-402: GET /payments/rate-backlog/day con el día y la moneda', async () => {
    const body = { date: '2026-10-28', currency: 'COP', count: 1, providerRateSaved: false };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    await expect(getRateBacklogDay('tok', '2026-10-28', 'COP')).resolves.toEqual(body);
    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://x');
    expect(parsed.pathname).toMatch(/\/payments\/rate-backlog\/day$/);
    expect(parsed.searchParams.get('date')).toBe('2026-10-28');
    expect(parsed.searchParams.get('currency')).toBe('COP');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('solo el ADMIN lo ve', () => {
    expect(canSeeRateBacklog('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canSeeRateBacklog(role)).toBe(false);
    }
  });
});

/**
 * DX-380: el aviso de abonos sin tasa de más de 24 h (solo ADMIN). Mockea el
 * `fetch` base, como payments-api.test.ts.
 */
import { canSeeRateBacklog, getRateBacklog } from './rate-backlog-api';

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

  it('solo el ADMIN lo ve', () => {
    expect(canSeeRateBacklog('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canSeeRateBacklog(role)).toBe(false);
    }
  });
});

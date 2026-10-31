/**
 * Mockea el `fetch` base (mismo enfoque que inventory-api.test.ts) y comprueba
 * la ruta y la query que arma `listCashPayments`.
 */
import { listCashPayments, recordSplitPayment } from './payments-api';

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

describe('recordSplitPayment (DX-390)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POST /treatment-plans/:id/split-payments con las líneas y la Idempotency-Key del cobro', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p1', payments: [] }) });
    global.fetch = spy as unknown as typeof fetch;
    const body = {
      paidAt: '2026-10-30',
      lines: [
        { amount: 50, currency: 'USD', paymentMethodId: 'm1' },
        { amount: 100000, currency: 'COP', paymentMethodId: 'm2', reference: 'TR-1' },
      ],
    };

    await recordSplitPayment('tok', 'plan-1', body, 'key-1');

    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/treatment-plans\/plan-1\/split-payments$/);
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('key-1');
    expect(JSON.parse(init.body)).toEqual(body);
  });
});

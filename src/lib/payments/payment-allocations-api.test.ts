/**
 * DX-051: rutas de la imputación de un abono. Mockea el `fetch` base, como
 * payments-api.test.ts.
 */
import { getPaymentAllocations, replacePaymentAllocations } from './payment-allocations-api';

describe('payment-allocations-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown) {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('ver: GET /payments/:id/allocations', async () => {
    const spy = mockFetch({ paymentId: 'pay-1', version: 'v1' });
    await expect(getPaymentAllocations('tok', 'pay-1')).resolves.toEqual({
      paymentId: 'pay-1',
      version: 'v1',
    });
    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/pay-1\/allocations$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('reasignar: PUT /payments/:id/allocations con el cuerpo tal cual', async () => {
    const spy = mockFetch({ paymentId: 'pay-1', previous: [] });
    const body = {
      expectedVersion: 'a'.repeat(64),
      mode: 'MANUAL' as const,
      allocations: [{ treatmentPlanItemId: 'item-1', amount: 40.5 }],
    };

    await expect(replacePaymentAllocations('tok', 'pay-1', body)).resolves.toEqual({
      paymentId: 'pay-1',
      previous: [],
    });

    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/pay-1\/allocations$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('reparto automático: el cuerpo no lleva líneas', async () => {
    const spy = mockFetch({});
    await replacePaymentAllocations('tok', 'pay-1', { expectedVersion: 'b'.repeat(64), mode: 'AUTO' });
    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({
      expectedVersion: 'b'.repeat(64),
      mode: 'AUTO',
    });
  });
});

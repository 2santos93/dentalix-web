/**
 * Mockea el `fetch` base y comprueba la ruta y la query de «Cobrado sin
 * imputar» (DX-399): la sede va en `locationId`, no solo en la cabecera.
 */
import { downloadUnallocatedPaymentsCsv, getUnallocatedPayments } from './unallocated-payments-api';

describe('unallocated-payments-api (DX-399)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = { items: [] }, text = 'csv') {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
      text: async () => text,
      headers: new Headers(),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /reports/unallocated-payments con el período y la página', async () => {
    const spy = mockFetch();
    await getUnallocatedPayments('tok', { from: '2026-10-01', to: '2026-10-31' }, { page: 2, pageSize: 25 });
    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://test');
    expect(parsed.pathname).toMatch(/\/reports\/unallocated-payments$/);
    expect(parsed.searchParams.get('from')).toBe('2026-10-01');
    expect(parsed.searchParams.get('to')).toBe('2026-10-31');
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('pageSize')).toBe('25');
    expect(parsed.searchParams.has('locationId')).toBe(false);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('manda locationId solo si se eligió una sede', async () => {
    const spy = mockFetch();
    await getUnallocatedPayments('tok', { from: '2026-10-01', to: '2026-10-31', locationId: 'loc-1' }, { page: 1, pageSize: 25 });
    expect(new URL(String(spy.mock.calls[0][0]), 'http://test').searchParams.get('locationId')).toBe('loc-1');
  });

  it('el CSV usa los mismos filtros, sin página', async () => {
    const spy = mockFetch();
    const text = await downloadUnallocatedPaymentsCsv('tok', { from: '2026-10-01', to: '2026-10-31', locationId: 'loc-1' });
    expect(text).toBe('csv');
    const parsed = new URL(String(spy.mock.calls[0][0]), 'http://test');
    expect(parsed.pathname).toMatch(/\/reports\/unallocated-payments\.csv$/);
    expect(parsed.searchParams.get('locationId')).toBe('loc-1');
    expect(parsed.searchParams.has('page')).toBe(false);
  });
});

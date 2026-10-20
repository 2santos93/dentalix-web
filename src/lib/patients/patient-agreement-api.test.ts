/** Comprueba rutas, métodos y cuerpos del cliente (DX-105). */
import {
  assignPatientAgreement,
  getPatientAgreement,
  getPriceQuote,
  removePatientAgreement,
} from './patient-agreement-api';

describe('patient-agreement-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = []) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, index = 0) {
    const [url, init] = spy.mock.calls[index];
    const parsed = new URL(String(url), 'http://x');
    return {
      path: parsed.pathname,
      search: parsed.search,
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
  }
  it('lee el convenio con y sin historial', async () => {
    const spy = mockFetch({ current: null, history: [] });
    await getPatientAgreement('tok', 'p-1');
    await getPatientAgreement('tok', 'p-1', { includeHistory: true });
    expect(call(spy, 0).path).toMatch(/\/patients\/p-1\/agreement$/);
    expect(call(spy, 0).search).toBe('');
    expect(call(spy, 1).search).toBe('?includeHistory=true');
  });

  it('asigna con PUT y quita con DELETE', async () => {
    const spy = mockFetch({});
    await assignPatientAgreement('tok', 'p-1', { agreementId: 'ag-1', coverageId: null, notes: 'Carnet' });
    await removePatientAgreement('tok', 'p-1');
    expect(call(spy, 0)).toMatchObject({
      method: 'PUT',
      body: { agreementId: 'ag-1', coverageId: null, notes: 'Carnet' },
    });
    expect(call(spy, 0).path).toMatch(/\/patients\/p-1\/agreement$/);
    expect(call(spy, 1)).toMatchObject({ method: 'DELETE' });
  });

  it('retirar tolera el 204 sin cuerpo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(removePatientAgreement('tok', 'p-1')).resolves.toBeUndefined();
  });

  it('pide el precio con prestación y moneda', async () => {
    const spy = mockFetch({ price: 100 });
    await getPriceQuote('tok', 'p-1', { catalogItemId: 'c-1', currency: 'COP' });
    expect(call(spy).path).toMatch(/\/patients\/p-1\/price-quote$/);
    expect(call(spy).search).toBe('?catalogItemId=c-1&currency=COP');
  });
});

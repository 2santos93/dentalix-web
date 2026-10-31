/** Comprueba rutas, métodos y cuerpos del cliente (DX-105). */
import {
  canManageAgreements,
  createAgreement,
  deleteAgreement,
  listAgreements,
  updateAgreement,
} from './agreements-api';

describe('agreements-api', () => {
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
  it('lista los activos por defecto y todos con includeInactive', async () => {
    const spy = mockFetch();
    await listAgreements('tok');
    await listAgreements('tok', { includeInactive: true });
    expect(call(spy, 0).path).toMatch(/\/agreements$/);
    expect(call(spy, 0).search).toBe('');
    expect(call(spy, 1).search).toBe('?includeInactive=true');
  });

  it('crea, edita y retira', async () => {
    const spy = mockFetch({});
    await createAgreement('tok', {
      name: 'Convenio Surco',
      payerId: 'payer-1',
      kind: 'PERCENT_DISCOUNT',
      percent: 15,
      percentByCategory: { Preventiva: 20 },
    });
    await updateAgreement('tok', 'ag-1', { active: false, validTo: null });
    await deleteAgreement('tok', 'ag-1');
    expect(call(spy, 0)).toMatchObject({
      method: 'POST',
      body: { name: 'Convenio Surco', kind: 'PERCENT_DISCOUNT', percent: 15, percentByCategory: { Preventiva: 20 } },
    });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false, validTo: null } });
    expect(call(spy, 1).path).toMatch(/\/agreements\/ag-1$/);
    expect(call(spy, 2)).toMatchObject({ method: 'DELETE' });
  });

  it('retirar tolera el 204 sin cuerpo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(deleteAgreement('tok', 'ag-1')).resolves.toBeUndefined();
  });

  it('solo ADMIN gestiona', () => {
    expect(canManageAgreements('ADMIN')).toBe(true);
    expect(canManageAgreements('RECEPTION')).toBe(false);
    expect(canManageAgreements('DENTIST')).toBe(false);
    expect(canManageAgreements(null)).toBe(false);
  });
});

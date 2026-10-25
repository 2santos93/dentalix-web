/** Comprueba rutas, métodos y cuerpos del cliente de coberturas (DX-153). */
import {
  createCoverage,
  deleteCoverage,
  listCoverages,
  updateCoverage,
  verifyCoverage,
} from './coverages-api';

describe('coverages-api', () => {
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
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
  }

  it('lista, crea, edita y quita bajo el paciente', async () => {
    const spy = mockFetch({});
    await listCoverages('tok', 'pat-1');
    await createCoverage('tok', 'pat-1', { payerId: 'payer-1', planName: 'Plan oro', isPrimary: true });
    await updateCoverage('tok', 'pat-1', 'cov-1', { validTo: null });
    await deleteCoverage('tok', 'pat-1', 'cov-1');

    expect(call(spy, 0)).toMatchObject({ method: 'GET' });
    expect(call(spy, 0).path).toMatch(/\/patients\/pat-1\/coverages$/);
    expect(call(spy, 1)).toMatchObject({
      method: 'POST',
      body: { payerId: 'payer-1', planName: 'Plan oro', isPrimary: true },
    });
    expect(call(spy, 2)).toMatchObject({ method: 'PATCH', body: { validTo: null } });
    expect(call(spy, 2).path).toMatch(/\/patients\/pat-1\/coverages\/cov-1$/);
    expect(call(spy, 3)).toMatchObject({ method: 'DELETE' });
    expect(call(spy, 3).path).toMatch(/\/patients\/pat-1\/coverages\/cov-1$/);
  });

  it('verificar (SEC-049) manda el nº que el ADMIN comprobó', async () => {
    const spy = mockFetch({});
    await verifyCoverage('tok', 'pat-1', 'cov-1', '1020304050');
    expect(call(spy)).toMatchObject({
      method: 'POST',
      body: { checkedMemberNumber: '1020304050' },
    });
    expect(call(spy).path).toMatch(/\/patients\/pat-1\/coverages\/cov-1\/verification$/);
  });

  it('quitar tolera el 204 sin cuerpo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(deleteCoverage('tok', 'pat-1', 'cov-1')).resolves.toBeUndefined();
  });
});

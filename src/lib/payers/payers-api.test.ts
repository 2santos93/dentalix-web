/** Comprueba rutas, métodos y cuerpos del cliente de pagadores (DX-153). */
import {
  canCreatePayer,
  canManagePayers,
  createPayer,
  deletePayer,
  listPayers,
  updatePayer,
} from './payers-api';

describe('payers-api', () => {
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
    await listPayers('tok');
    await listPayers('tok', { includeInactive: true });
    expect(call(spy, 0).path).toMatch(/\/payers$/);
    expect(call(spy, 0).search).toBe('');
    expect(call(spy, 1).search).toBe('?includeInactive=true');
  });

  it('crea, edita y retira', async () => {
    const spy = mockFetch({});
    await createPayer('tok', { name: 'Sanavida', type: 'PUBLIC_SYSTEM' });
    await updatePayer('tok', 'payer-1', { active: false });
    await deletePayer('tok', 'payer-1');
    expect(call(spy, 0)).toMatchObject({
      method: 'POST',
      body: { name: 'Sanavida', type: 'PUBLIC_SYSTEM' },
    });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect(call(spy, 1).path).toMatch(/\/payers\/payer-1$/);
    expect(call(spy, 2)).toMatchObject({ method: 'DELETE' });
    expect(call(spy, 2).path).toMatch(/\/payers\/payer-1$/);
  });

  it('retirar tolera el 204 sin cuerpo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(deletePayer('tok', 'payer-1')).resolves.toBeUndefined();
  });

  it('solo ADMIN gestiona; ADMIN y RECEPTION crean', () => {
    expect(canManagePayers('ADMIN')).toBe(true);
    expect(canManagePayers('RECEPTION')).toBe(false);
    expect(canManagePayers(null)).toBe(false);
    expect(canCreatePayer('ADMIN')).toBe(true);
    expect(canCreatePayer('RECEPTION')).toBe(true);
    expect(canCreatePayer('DENTIST')).toBe(false);
    expect(canCreatePayer('ASSISTANT')).toBe(false);
    expect(canCreatePayer(null)).toBe(false);
  });
});

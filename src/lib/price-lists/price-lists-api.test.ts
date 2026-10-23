/** Comprueba rutas, métodos y cuerpos del cliente (DX-105). */
import {
  canManagePriceLists,
  createPriceList,
  deletePriceList,
  listPriceListItems,
  listPriceLists,
  replacePriceListItems,
  updatePriceList,
} from './price-lists-api';

describe('price-lists-api', () => {
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
  it('lista las activas por defecto y todas con includeInactive', async () => {
    const spy = mockFetch();
    await listPriceLists('tok');
    await listPriceLists('tok', { includeInactive: true });
    expect(call(spy, 0).path).toMatch(/\/price-lists$/);
    expect(call(spy, 0).search).toBe('');
    expect(call(spy, 1).search).toBe('?includeInactive=true');
  });

  it('crea, edita y retira', async () => {
    const spy = mockFetch({});
    await createPriceList('tok', { name: 'Sede Norte', currency: 'COP', locationId: 'loc-1' });
    await updatePriceList('tok', 'pl-1', { active: false, locationId: null });
    await deletePriceList('tok', 'pl-1');
    expect(call(spy, 0)).toMatchObject({
      method: 'POST',
      body: { name: 'Sede Norte', currency: 'COP', locationId: 'loc-1' },
    });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false, locationId: null } });
    expect(call(spy, 1).path).toMatch(/\/price-lists\/pl-1$/);
    expect(call(spy, 2)).toMatchObject({ method: 'DELETE' });
  });

  it('retirar tolera el 204 sin cuerpo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(deletePriceList('tok', 'pl-1')).resolves.toBeUndefined();
  });

  it('pide los ítems con búsqueda y página, y sin parámetros vacíos', async () => {
    const spy = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 });
    await listPriceListItems('tok', 'pl-1', { query: 'resina', page: 2 });
    await listPriceListItems('tok', 'pl-1');
    expect(call(spy, 0).path).toMatch(/\/price-lists\/pl-1\/items$/);
    expect(call(spy, 0).search).toBe('?query=resina&page=2');
    expect(call(spy, 1).search).toBe('');
  });

  it('PUT de los ítems manda las filas tal cual, con price null para quitar', async () => {
    const spy = mockFetch({ upserted: 1, removed: 0 });
    await replacePriceListItems('tok', 'pl-1', [
      { catalogItemId: 'c-1', price: 150.5 },
      { catalogItemId: 'c-2', price: null },
    ]);
    expect(call(spy)).toMatchObject({
      method: 'PUT',
      body: {
        items: [
          { catalogItemId: 'c-1', price: 150.5 },
          { catalogItemId: 'c-2', price: null },
        ],
      },
    });
    expect(call(spy).path).toMatch(/\/price-lists\/pl-1\/items$/);
  });

  it('solo ADMIN gestiona', () => {
    expect(canManagePriceLists('ADMIN')).toBe(true);
    expect(canManagePriceLists('DENTIST')).toBe(false);
    expect(canManagePriceLists('RECEPTION')).toBe(false);
    expect(canManagePriceLists(null)).toBe(false);
  });
});

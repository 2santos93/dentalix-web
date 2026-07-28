/**
 * Mocks the base `fetch` (same approach as `src/lib/staff/staff-api.test.ts`
 * / `src/lib/api/client.test.ts`) and asserts each `inventory-api.ts`
 * function hits the right method/path/payload against the `/inventory/items`
 * base path.
 */
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  recordMovement,
} from './inventory-api';

describe('inventory-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('listItems: GET /inventory/items', async () => {
    const items = [
      {
        id: 'i1',
        name: 'Guantes de latex',
        sku: 'GL-100',
        unit: 'caja',
        minStock: 5,
        notes: null,
        createdById: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        stock: 10,
        lowStock: false,
      },
    ];
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => items });
    global.fetch = spy as unknown as typeof fetch;

    const out = await listItems('tok');

    expect(out).toEqual(items);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/inventory/items');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('createItem: POST /inventory/items with the given input', async () => {
    const created = {
      id: 'i2',
      name: 'Algodón',
      sku: null,
      unit: 'paquete',
      minStock: 0,
      notes: null,
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => created });
    global.fetch = spy as unknown as typeof fetch;

    const input = { name: 'Algodón', unit: 'paquete' };
    const out = await createItem('tok', input);

    expect(out).toEqual(created);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/inventory\/items$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('getItem: GET /inventory/items/:id', async () => {
    const detail = {
      id: 'id1',
      name: 'Guantes de latex',
      sku: 'GL-100',
      unit: 'caja',
      minStock: 5,
      notes: null,
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      stock: 10,
      lowStock: false,
      movements: [],
    };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => detail });
    global.fetch = spy as unknown as typeof fetch;

    const out = await getItem('tok', 'id1');

    expect(out).toEqual(detail);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/inventory\/items\/id1$/);
    expect(init.method).toBe('GET');
  });

  it('updateItem: PATCH /inventory/items/:id with the given patch', async () => {
    const updated = {
      id: 'id1',
      name: 'Guantes de latex',
      sku: 'GL-100',
      unit: 'caja',
      minStock: 5,
      notes: null,
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => updated });
    global.fetch = spy as unknown as typeof fetch;

    const out = await updateItem('tok', 'id1', { minStock: 5 });

    expect(out).toEqual(updated);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/inventory\/items\/id1$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ minStock: 5 });
  });

  it('deleteItem: DELETE /inventory/items/:id, tolerating the 204 empty body', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = spy as unknown as typeof fetch;

    await expect(deleteItem('tok', 'id1')).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/inventory\/items\/id1$/);
    expect(init.method).toBe('DELETE');
  });

  it('recordMovement: POST /inventory/items/:id/movements with the given input', async () => {
    const movement = {
      id: 'm1',
      itemId: 'id1',
      type: 'IN',
      quantity: 3,
      reason: null,
      occurredAt: '2026-01-01T00:00:00.000Z',
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => movement });
    global.fetch = spy as unknown as typeof fetch;

    const input = { type: 'IN' as const, quantity: 3 };
    const out = await recordMovement('tok', 'id1', input);

    expect(out).toEqual(movement);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/inventory\/items\/id1\/movements$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(input);
  });
});

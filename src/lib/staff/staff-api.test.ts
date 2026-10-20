/**
 * Mocks the base `fetch` (same approach as `src/lib/api/client.test.ts`) and
 * asserts each `staff-api.ts` function hits the right method/path/payload —
 * no domain-specific `*-api.test.ts` exists yet elsewhere in the app to
 * mirror 1:1 (appointments/patients api clients are only exercised
 * indirectly through their component tests), so this follows `client.test.ts`'s
 * fetch-mocking convention instead.
 */
import {
  listStaff,
  updateStaff,
  deactivateStaff,
  unlockStaffLogin,
  getStaffLocations,
  replaceStaffLocations,
} from './staff-api';
import { ApiError } from '@/lib/api/client';

describe('staff-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('listStaff: GET /staff', async () => {
    const staff = [{ userId: 'u1', fullName: 'Ana Ríos', email: 'ana@clinic.com', role: 'DENTIST' }];
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => staff });
    global.fetch = spy as unknown as typeof fetch;

    const out = await listStaff('tok');

    expect(out).toEqual(staff);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('updateStaff: PATCH /staff/:userId with the given patch', async () => {
    const updated = { userId: 'u1', fullName: 'Ana Ríos G.', email: 'ana@clinic.com', role: 'ADMIN' };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => updated });
    global.fetch = spy as unknown as typeof fetch;

    const out = await updateStaff('tok', 'u1', { fullName: 'Ana Ríos G.', role: 'ADMIN' });

    expect(out).toEqual(updated);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff\/u1$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ fullName: 'Ana Ríos G.', role: 'ADMIN' });
  });

  it('deactivateStaff: DELETE /staff/:userId, tolerating the 204 empty body', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = spy as unknown as typeof fetch;

    await expect(deactivateStaff('tok', 'u1')).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff\/u1$/);
    expect(init.method).toBe('DELETE');
  });

  it('deactivateStaff: surfaces the backend 409 (last admin / self-deactivation) as an ApiError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'No puedes desactivar al último administrador.' }),
    }) as unknown as typeof fetch;

    await expect(deactivateStaff('tok', 'u1')).rejects.toBeInstanceOf(ApiError);
    await expect(deactivateStaff('tok', 'u1')).rejects.toThrow(
      'No puedes desactivar al último administrador.',
    );
  });

  it('unlockStaffLogin (DX-048): POST /staff/:userId/login-unlock, tolerando el 204 sin cuerpo', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = spy as unknown as typeof fetch;

    await expect(unlockStaffLogin('tok', 'u1')).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff\/u1\/login-unlock$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
});

describe('staff-api — sedes del miembro (DX-089)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('getStaffLocations: GET /staff/:userId/locations', async () => {
    const body = { all: false, locationIds: ['s1'] };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    await expect(getStaffLocations('tok', 'u1')).resolves.toEqual(body);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff\/u1\/locations$/);
    expect(init.method).toBe('GET');
  });

  it('replaceStaffLocations: PUT /staff/:userId/locations con { locationIds } ([] = todas)', async () => {
    const body = { all: true, locationIds: [] };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;

    await expect(replaceStaffLocations('tok', 'u1', [])).resolves.toEqual(body);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/staff\/u1\/locations$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ locationIds: [] });
  });

  it('replaceStaffLocations: el 409 de un ADMIN llega como ApiError con el mensaje de la API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        statusCode: 409,
        message: 'El ADMIN siempre tiene todas las sedes y no se puede restringir.',
      }),
    }) as unknown as typeof fetch;

    await expect(replaceStaffLocations('tok', 'u1', ['s1'])).rejects.toMatchObject({
      status: 409,
      message: 'El ADMIN siempre tiene todas las sedes y no se puede restringir.',
    });
  });
});

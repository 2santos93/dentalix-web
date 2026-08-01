/**
 * Mocks the base `fetch` (same approach as `src/lib/api/client.test.ts`) and
 * asserts each `staff-api.ts` function hits the right method/path/payload —
 * no domain-specific `*-api.test.ts` exists yet elsewhere in the app to
 * mirror 1:1 (appointments/patients api clients are only exercised
 * indirectly through their component tests), so this follows `client.test.ts`'s
 * fetch-mocking convention instead.
 */
import { listStaff, updateStaff, deactivateStaff } from './staff-api';
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
});

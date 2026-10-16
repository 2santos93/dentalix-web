/**
 * Mockea el `fetch` base (mismo enfoque que consents-api.test.ts) y comprueba
 * rutas, métodos y cuerpos de los tipos de cita (DX-121).
 */
import {
  canManageAppointmentTypes,
  createAppointmentType,
  deleteAppointmentType,
  listAppointmentTypes,
  updateAppointmentType,
} from './appointment-types-api';
import { canMoveAppointments, listAppointments } from './appointments-api';

describe('appointment-types-api', () => {
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
    await listAppointmentTypes('tok');
    await listAppointmentTypes('tok', { includeInactive: true });
    expect(call(spy, 0).path).toMatch(/\/appointment-types$/);
    expect(call(spy, 0).search).toBe('');
    expect(call(spy, 1).search).toBe('?includeInactive=true');
  });

  it('crea, edita y retira', async () => {
    const spy = mockFetch({});
    await createAppointmentType('tok', { name: 'Endodoncia', durationMinutes: 90, color: '#7C3AED' });
    await updateAppointmentType('tok', 'type-1', { active: false });
    await deleteAppointmentType('tok', 'type-1');
    expect(call(spy, 0)).toMatchObject({
      method: 'POST',
      body: { name: 'Endodoncia', durationMinutes: 90, color: '#7C3AED' },
    });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect(call(spy, 1).path).toMatch(/\/appointment-types\/type-1$/);
    expect(call(spy, 2).method).toBe('DELETE');
  });

  it('solo ADMIN gestiona tipos', () => {
    expect(canManageAppointmentTypes('ADMIN')).toBe(true);
    expect(canManageAppointmentTypes('RECEPTION')).toBe(false);
    expect(canManageAppointmentTypes(null)).toBe(false);
  });
});

describe('appointments-api (DX-121)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('repite providerIds en la query y manda la sede', async () => {
    const spy = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = spy as unknown as typeof fetch;
    await listAppointments('tok', {
      from: '2031-03-03T05:00:00.000Z',
      to: '2031-03-04T05:00:00.000Z',
      providerIds: ['a', 'b'],
    });
    const url = new URL(String(spy.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.getAll('providerIds')).toEqual(['a', 'b']);
  });

  it('mueven citas los mismos roles que la API (APPOINTMENT_ROLES); sin sesión, nadie', () => {
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(canMoveAppointments(role)).toBe(true);
    }
    expect(canMoveAppointments(null)).toBe(false);
  });
});

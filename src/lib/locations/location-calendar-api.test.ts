/** Rutas, métodos, cabecera y cuerpos del cliente del calendario de la sede (DX-316, spec §6). */
import { ApiError } from '@/lib/api/client';
import {
  createHoliday,
  deleteHoliday,
  getLocationCalendar,
  importHolidays,
  previewHolidayImport,
  setWorkingWeekdays,
  updateHoliday,
} from './location-calendar-api';

describe('location-calendar-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = {}, status = 200) {
    const spy = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
      headers: new Headers(),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, index = 0) {
    const [url, init] = spy.mock.calls[index];
    const headers = (init.headers ?? {}) as Record<string, string>;
    return {
      path: new URL(String(url), 'http://x').pathname,
      method: (init.method ?? 'GET') as string,
      authorization: headers.Authorization,
      body: init.body as unknown,
    };
  }

  it('GET /locations/:id/calendar', async () => {
    const spy = mockFetch({ locationId: 'loc-1', workingWeekdays: [1, 2, 3, 4, 5], holidays: [] });
    await expect(getLocationCalendar('tok', 'loc-1')).resolves.toEqual({
      locationId: 'loc-1',
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [],
    });
    expect(call(spy)).toMatchObject({ method: 'GET', authorization: 'Bearer tok' });
    expect(call(spy).path).toMatch(/\/locations\/loc-1\/calendar$/);
  });

  it('PUT /locations/:id/calendar/working-weekdays with the days', async () => {
    const spy = mockFetch({});
    await setWorkingWeekdays('tok', 'loc-1', [0, 1, 2, 3, 4]);
    expect(call(spy)).toMatchObject({ method: 'PUT', authorization: 'Bearer tok' });
    expect(call(spy).path).toMatch(/\/locations\/loc-1\/calendar\/working-weekdays$/);
    expect(JSON.parse(call(spy).body as string)).toEqual({ workingWeekdays: [0, 1, 2, 3, 4] });
  });

  it('POST, PATCH and DELETE under /locations/:id/holidays', async () => {
    const spy = mockFetch({});
    await createHoliday('tok', 'loc-1', { date: '2027-05-03', name: 'Cierre anual', recurring: false });
    await updateHoliday('tok', 'loc-1', 'hol-1', { recurring: true });
    await deleteHoliday('tok', 'loc-1', 'hol-1');

    expect(call(spy, 0)).toMatchObject({ method: 'POST', authorization: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/locations\/loc-1\/holidays$/);
    expect(JSON.parse(call(spy, 0).body as string)).toEqual({
      date: '2027-05-03',
      name: 'Cierre anual',
      recurring: false,
    });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', authorization: 'Bearer tok' });
    expect(call(spy, 1).path).toMatch(/\/locations\/loc-1\/holidays\/hol-1$/);
    expect(JSON.parse(call(spy, 1).body as string)).toEqual({ recurring: true });
    expect(call(spy, 2)).toMatchObject({ method: 'DELETE', authorization: 'Bearer tok' });
    expect(call(spy, 2).path).toMatch(/\/locations\/loc-1\/holidays\/hol-1$/);
  });

  it('DELETE tolerates the 204 without a body', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;
    await expect(deleteHoliday('tok', 'loc-1', 'hol-1')).resolves.toBeUndefined();
  });

  it('encodes the ids in the path', async () => {
    const spy = mockFetch({});
    await updateHoliday('tok', 'a/b', 'c?d', { name: 'x' });
    expect(String(spy.mock.calls[0][0])).toMatch(/\/locations\/a%2Fb\/holidays\/c%3Fd$/);
  });

  it.each([
    ['preview', previewHolidayImport, /\/locations\/loc-1\/holidays\/import\/preview$/],
    ['import', importHolidays, /\/locations\/loc-1\/holidays\/import$/],
  ] as const)('%s sends the file as FormData in the field «file»', async (_name, fn, path) => {
    const spy = mockFetch({ format: 'ICS', dryRun: true, counts: { new: 0, duplicate: 0, error: 0 }, rows: [] });
    const file = new File(['BEGIN:VCALENDAR'], 'festivos.ics', { type: 'text/calendar' });
    await fn('tok', 'loc-1', file);
    const sent = call(spy);
    expect(sent).toMatchObject({ method: 'POST', authorization: 'Bearer tok' });
    expect(sent.path).toMatch(path);
    expect(sent.body).toBeInstanceOf(FormData);
    expect((sent.body as FormData).get('file')).toBeInstanceOf(File);
    expect(((sent.body as FormData).get('file') as File).name).toBe('festivos.ics');
    // El navegador pone el boundary: nada de JSON.
    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('a 400 message as a string or as the class-validator array both reach ApiError.messages', async () => {
    mockFetch({ statusCode: 400, message: 'El nombre es obligatorio (hasta 120 caracteres).' }, 400);
    const single = await createHoliday('tok', 'loc-1', { date: '2027-05-03', name: '', recurring: false }).catch(
      (e: unknown) => e,
    );
    expect(single).toBeInstanceOf(ApiError);
    expect((single as ApiError).messages).toEqual(['El nombre es obligatorio (hasta 120 caracteres).']);

    mockFetch({ statusCode: 400, message: ['Elige al menos un día hábil.'] }, 400);
    const list = await setWorkingWeekdays('tok', 'loc-1', []).catch((e: unknown) => e);
    expect(list).toBeInstanceOf(ApiError);
    expect((list as ApiError).messages).toEqual(['Elige al menos un día hábil.']);
  });

  async function rejection(promise: Promise<unknown>): Promise<ApiError> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  const limitBody = {
    statusCode: 409,
    error: 'Conflict',
    code: 'LOCATION_HOLIDAY_LIMIT',
    message: 'La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.',
  };
  const ics = () => new File(['BEGIN:VCALENDAR'], 'festivos.ics', { type: 'text/calendar' });

  it.each([
    ['createHoliday', () => createHoliday('tok', 'loc-1', { date: '2027-05-03', name: 'Cierre anual', recurring: false })],
    ['previewHolidayImport (spec I1)', () => previewHolidayImport('tok', 'loc-1', ics())],
    ['importHolidays', () => importHolidays('tok', 'loc-1', ics())],
  ])('409 LOCATION_HOLIDAY_LIMIT on %s keeps code and message', async (_name, run) => {
    mockFetch(limitBody, 409);
    const error = await rejection(run());
    expect(error.status).toBe(409);
    expect(error.code).toBe('LOCATION_HOLIDAY_LIMIT');
    expect(error.messages).toEqual(['La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.']);
  });

  it('409 HOLIDAY_ALREADY_EXISTS names the existing holiday and carries its id', async () => {
    mockFetch(
      {
        statusCode: 409,
        error: 'Conflict',
        code: 'HOLIDAY_ALREADY_EXISTS',
        message: 'Ese día ya es festivo cada año: «Cierre anual».',
        holidayId: 'hol-9',
      },
      409,
    );
    const error = await rejection(
      createHoliday('tok', 'loc-1', { date: '2030-05-03', name: 'Otro', recurring: false }),
    );
    expect(error.code).toBe('HOLIDAY_ALREADY_EXISTS');
    expect(error.messages).toEqual(['Ese día ya es festivo cada año: «Cierre anual».']);
    expect(error.holidayId).toBe('hol-9');
  });

  it('404 HOLIDAY_NOT_FOUND on delete throws instead of resolving', async () => {
    mockFetch({ statusCode: 404, error: 'Not Found', code: 'HOLIDAY_NOT_FOUND', message: 'No encontramos ese festivo.' }, 404);
    const error = await rejection(deleteHoliday('tok', 'loc-1', 'hol-1'));
    expect(error.status).toBe(404);
    expect(error.code).toBe('HOLIDAY_NOT_FOUND');
    expect(error.messages).toEqual(['No encontramos ese festivo.']);
  });
});

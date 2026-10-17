/**
 * Mockea el `fetch` base (mismo enfoque que appointment-types-api.test.ts) y
 * comprueba rutas, métodos y cuerpos de los recordatorios (DX-026), y los
 * rótulos que pinta la UI.
 */
import {
  canManageReminders,
  getAppointmentReminders,
  leadHoursLabel,
  leadListLabel,
  listReminderSettings,
  updateReminderSettings,
} from './reminders-api';

describe('reminders-api', () => {
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

  function call(spy: jest.Mock) {
    const [url, init] = spy.mock.calls[0];
    return {
      path: new URL(String(url), 'http://x').pathname,
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
  }

  it('solo ADMIN configura los recordatorios (como la API)', () => {
    expect(canManageReminders('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageReminders(role)).toBe(false);
    }
  });

  it('GET /reminder-settings', async () => {
    const spy = mockFetch([]);
    await listReminderSettings('tok');
    expect(call(spy)).toMatchObject({ path: '/api/v1/reminder-settings', method: 'GET' });
  });

  it('PUT /reminder-settings/:locationId con activo y antelaciones', async () => {
    const spy = mockFetch({});
    await updateReminderSettings('tok', 'loc/1', { enabled: true, leadHours: [48, 2] });
    expect(call(spy)).toEqual({
      path: '/api/v1/reminder-settings/loc%2F1',
      method: 'PUT',
      body: { enabled: true, leadHours: [48, 2] },
    });
  });

  it('GET /appointments/:id/reminders', async () => {
    const spy = mockFetch({ enabled: false, leadHours: [], items: [] });
    await getAppointmentReminders('tok', 'a-1');
    expect(call(spy)).toMatchObject({ path: '/api/v1/appointments/a-1/reminders', method: 'GET' });
  });

  it('rótulos de antelación en español', () => {
    expect(leadHoursLabel(2)).toBe('2 h antes');
    expect(leadHoursLabel(24)).toBe('1 día antes');
    expect(leadHoursLabel(48)).toBe('2 días antes');
    expect(leadHoursLabel(36)).toBe('36 h antes');
    expect(leadListLabel([48, 2])).toBe('2 días y 2 h antes');
    expect(leadListLabel([72, 24, 2])).toBe('3 días, 1 día y 2 h antes');
    expect(leadListLabel([])).toBe('Sin antelaciones');
  });
});

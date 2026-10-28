/** Cliente de Ajustes › Mayoría de edad (DX-328). */
import {
  MAJORITY_AGE_OPTIONS,
  canManagePatientSettings,
  getPatientSettings,
  savePatientSettings,
} from './patient-settings-api';

describe('patient-settings-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('MAJORITY_AGE_OPTIONS is 14..21', () => {
    expect(MAJORITY_AGE_OPTIONS).toEqual([14, 15, 16, 17, 18, 19, 20, 21]);
  });

  it('solo ADMIN la cambia', () => {
    expect(canManagePatientSettings('ADMIN')).toBe(true);
    expect(canManagePatientSettings('RECEPTION')).toBe(false);
    expect(canManagePatientSettings('DENTIST')).toBe(false);
    expect(canManagePatientSettings(null)).toBe(false);
  });

  it('lee y guarda en /patients/settings', async () => {
    const spy = mockFetch({ majorityAge: 16 });
    await expect(getPatientSettings('tok')).resolves.toEqual({ majorityAge: 16 });
    expect(new URL(String(spy.mock.calls[0][0]), 'http://x').pathname).toMatch(/\/patients\/settings$/);
    await savePatientSettings('tok', { majorityAge: 16 });
    const [url, init] = spy.mock.calls[1];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/patients\/settings$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ majorityAge: 16 });
  });
});

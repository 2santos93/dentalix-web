import {
  canManageWeeklyDigest,
  getWeeklyDigestSettings,
  sendWeeklyDigestTest,
  updateWeeklyDigestSettings,
} from './weekly-digest-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('weekly-digest-api (DX-568)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('solo ADMIN gestiona el resumen semanal', () => {
    expect(canManageWeeklyDigest('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageWeeklyDigest(role)).toBe(false);
    }
  });

  it('lee los ajustes con sesión', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await getWeeklyDigestSettings('tk');
    expect(mockedFetch).toHaveBeenCalledWith('/clinic/weekly-digest-settings', { token: 'tk' });
  });

  it('guarda con PUT el cuerpo entero', async () => {
    mockedFetch.mockResolvedValue({} as never);
    const body = { enabled: true, weekday: 1, hour: 7, recipientMembershipIds: ['m1'] };
    await updateWeeklyDigestSettings('tk', body);
    expect(mockedFetch).toHaveBeenCalledWith('/clinic/weekly-digest-settings', {
      method: 'PUT',
      body,
      token: 'tk',
    });
  });

  it('pide la prueba con POST', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await sendWeeklyDigestTest('tk');
    expect(mockedFetch).toHaveBeenCalledWith('/clinic/weekly-digest/send-test', { method: 'POST', token: 'tk' });
  });
});

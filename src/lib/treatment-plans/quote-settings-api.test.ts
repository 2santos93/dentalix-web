import { apiFetch } from '../api/client';
import {
  canManageQuoteSettings,
  getQuoteSettings,
  parseQuoteValidityDays,
  saveQuoteSettings,
} from './quote-settings-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = jest.mocked(apiFetch);

describe('quote-settings-api (DX-379)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('solo ADMIN cambia la validez', () => {
    expect(canManageQuoteSettings('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageQuoteSettings(role)).toBe(false);
    }
  });

  it('acepta un entero de 1 a 365 y nada más', () => {
    expect(parseQuoteValidityDays('1')).toBe(1);
    expect(parseQuoteValidityDays(' 45 ')).toBe(45);
    expect(parseQuoteValidityDays('365')).toBe(365);
    for (const bad of ['', '0', '366', '1000', '15,5', '15.5', '1e2', '-3', 'treinta']) {
      expect(parseQuoteValidityDays(bad)).toBeNull();
    }
  });

  it('GET y PUT /treatment-plan-settings', async () => {
    mockedFetch.mockResolvedValue({ validityDays: 30 });
    await getQuoteSettings('tok');
    expect(mockedFetch).toHaveBeenCalledWith('/treatment-plan-settings', { token: 'tok' });
    await saveQuoteSettings('tok', { validityDays: 45 });
    expect(mockedFetch).toHaveBeenLastCalledWith('/treatment-plan-settings', {
      method: 'PUT',
      body: { validityDays: 45 },
      token: 'tok',
    });
  });
});

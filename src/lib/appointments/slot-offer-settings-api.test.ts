import { apiFetch } from '../api/client';
import {
  canManageSlotOfferSettings,
  getSlotOfferSettings,
  parseExpiryLeadMinutes,
  parseMinLeadMinutes,
  saveSlotOfferSettings,
} from './slot-offer-settings-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = jest.mocked(apiFetch);

describe('slot-offer-settings-api (DX-448)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('solo ADMIN los cambia', () => {
    expect(canManageSlotOfferSettings('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageSlotOfferSettings(role)).toBe(false);
    }
  });

  it('caducidad: un entero de 0 a 240 y nada más', () => {
    expect(parseExpiryLeadMinutes('0')).toBe(0);
    expect(parseExpiryLeadMinutes(' 60 ')).toBe(60);
    expect(parseExpiryLeadMinutes('240')).toBe(240);
    for (const bad of ['', '241', '1000', '15,5', '15.5', '1e2', '-3', 'una hora']) {
      expect(parseExpiryLeadMinutes(bad)).toBeNull();
    }
  });

  it('antelación mínima: un entero de 5 a 240 y nada más', () => {
    expect(parseMinLeadMinutes('5')).toBe(5);
    expect(parseMinLeadMinutes('240')).toBe(240);
    for (const bad of ['', '0', '4', '241', '20,5', '-20']) {
      expect(parseMinLeadMinutes(bad)).toBeNull();
    }
  });

  it('GET y PUT /slot-offer-settings', async () => {
    mockedFetch.mockResolvedValue({
      expiryLeadMinutes: 0,
      minLeadMinutes: 20,
      defaultExpiryLeadMinutes: 0,
      defaultMinLeadMinutes: 20,
    });
    await getSlotOfferSettings('tok');
    expect(mockedFetch).toHaveBeenCalledWith('/slot-offer-settings', { token: 'tok' });
    await saveSlotOfferSettings('tok', { expiryLeadMinutes: 60, minLeadMinutes: 30 });
    expect(mockedFetch).toHaveBeenLastCalledWith('/slot-offer-settings', {
      method: 'PUT',
      body: { expiryLeadMinutes: 60, minLeadMinutes: 30 },
      token: 'tok',
    });
  });
});

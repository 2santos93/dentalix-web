import {
  canEditCommunication,
  formatE164,
  getPatientCommunication,
  phoneCountryName,
  updatePatientCommunication,
} from './communication-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('communication-api (DX-128)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lee el bloque del paciente', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await getPatientCommunication('tok', 'p 1');
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p%201/communication', { token: 'tok' });
  });

  it('lo cambia con PATCH', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await updatePatientCommunication('tok', 'p1', { contactChannel: 'NONE' });
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p1/communication', {
      method: 'PATCH',
      body: { contactChannel: 'NONE' },
      token: 'tok',
    });
  });

  it('solo recepción y ADMIN editan', () => {
    expect(canEditCommunication('RECEPTION')).toBe(true);
    expect(canEditCommunication('ADMIN')).toBe(true);
    expect(canEditCommunication('DENTIST')).toBe(false);
    expect(canEditCommunication('ASSISTANT')).toBe(false);
    expect(canEditCommunication(null)).toBe(false);
  });

  it.each([
    ['+573101234567', '+57 310 123 4567'],
    ['+34612345678', '+34 612 34 56 78'],
    ['+525512345678', '+525512345678'],
  ])('formatea %s', (e164, label) => {
    expect(formatE164(e164)).toBe(label);
  });

  it('nombra el país de la sede', () => {
    expect(phoneCountryName('CO')).toBe('Colombia');
    expect(phoneCountryName('ES')).toBe('España');
    expect(phoneCountryName('MX')).toBe('MX');
    expect(phoneCountryName(null)).toBeNull();
  });
});

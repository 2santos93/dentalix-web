import {
  groupVerificationCode,
  verificationUrlLabel,
  getPublicPrescriptionVerification,
} from './prescription-verification';
import { apiFetch } from '@/lib/api/client';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('código de verificación de la receta (DX-467)', () => {
  it('se lee en grupos de 4', () => {
    expect(groupVerificationCode('K7M2P9QRT4XW')).toBe('K7M2-P9QR-T4XW');
  });

  it('la URL impresa va sin protocolo, para leerla y teclearla', () => {
    expect(verificationUrlLabel('https://demo.dentalix.app/receta/K7M2P9QRT4XW')).toBe(
      'demo.dentalix.app/receta/K7M2P9QRT4XW',
    );
    expect(verificationUrlLabel('http://demo.localhost:3001/receta/K7M2P9QRT4XW')).toBe(
      'demo.localhost:3001/receta/K7M2P9QRT4XW',
    );
  });

  it('pregunta a la ruta pública sin sesión, con el código escapado', async () => {
    mockedFetch.mockResolvedValue({ state: 'VALID' });
    await getPublicPrescriptionVerification('K7M2 P9QR/T4XW');
    expect(mockedFetch).toHaveBeenCalledWith('/public/prescription-verifications/K7M2%20P9QR%2FT4XW');
  });
});

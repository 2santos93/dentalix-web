import { getAppointment, updateAppointment } from './appointments-api';
import { apiFetch } from '@/lib/api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));

describe('appointments-api: el id va codificado en la ruta (DX-567)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un id con «../» no cambia de ruta', () => {
    void getAppointment('t', '../payments/x');
    expect(apiFetch).toHaveBeenLastCalledWith('/appointments/..%2Fpayments%2Fx', { token: 't' });
    void updateAppointment('t', '../x', { status: 'CONFIRMED' });
    expect(jest.mocked(apiFetch).mock.calls.at(-1)?.[0]).toBe('/appointments/..%2Fx');
  });
});

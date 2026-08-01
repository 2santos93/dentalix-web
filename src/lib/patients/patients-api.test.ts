import { updatePatient } from './patients-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchOrNull: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('updatePatient', () => {
  it('hace PATCH al paciente con el cuerpo recibido', async () => {
    mockedFetch.mockResolvedValue({ id: 'p1' } as never);

    await updatePatient('tok', 'p1', { occupation: 'Docente' });

    expect(mockedFetch).toHaveBeenCalledWith('/patients/p1', {
      method: 'PATCH',
      body: { occupation: 'Docente' },
      token: 'tok',
    });
  });
});

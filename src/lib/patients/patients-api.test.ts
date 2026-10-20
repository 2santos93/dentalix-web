import { listPatients, updatePatient } from './patients-api';
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

describe('listPatients (DX-153)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('manda payerId junto a la búsqueda y la paginación', async () => {
    mockedFetch.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 } as never);

    await listPatients('tok', {
      query: 'ana',
      page: 2,
      payerId: '5b0c7f7e-0000-4000-8000-000000000001',
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      '/patients?query=ana&page=2&payerId=5b0c7f7e-0000-4000-8000-000000000001',
      { token: 'tok' },
    );
  });

  it('sin payerId no añade el parámetro', async () => {
    mockedFetch.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 } as never);

    await listPatients('tok', { query: 'ana' });

    expect(mockedFetch).toHaveBeenCalledWith('/patients?query=ana', { token: 'tok' });
  });
});

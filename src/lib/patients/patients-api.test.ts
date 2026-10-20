import { listPatients, replacePatientKeepingDerived, updatePatient, type Patient } from './patients-api';
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

describe('replacePatientKeepingDerived (DX-153)', () => {
  const cov = { status: 'EXPIRED', payerName: 'Sura EPS', planName: null, validTo: '2026-01-31' };
  const bal = { hasOverdue: true, overdueDays: 40 };
  it('conserva coverage y balance cuando la respuesta de la mutación no los trae', () => {
    const prev = { id: 'p1', firstName: 'A', coverage: cov, balance: bal } as unknown as Patient;
    const next = { id: 'p1', firstName: 'B' } as unknown as Patient;
    expect(replacePatientKeepingDerived(prev, next)).toEqual({ id: 'p1', firstName: 'B', coverage: cov, balance: bal });
  });
  it('usa los de la respuesta si los trae y tolera prev nulo', () => {
    const next = { id: 'p1', coverage: cov } as unknown as Patient;
    expect(replacePatientKeepingDerived(null, next).coverage).toBe(cov);
  });
});

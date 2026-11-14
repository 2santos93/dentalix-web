import {
  canExportImaging,
  fetchPatientImagingExport,
  imagingExportFileName,
  listPatients,
  replacePatientKeepingDerived,
  updatePatient,
  type Patient,
} from './patients-api';
import { apiFetch, apiFetchText } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchOrNull: jest.fn(), apiFetchText: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedFetchText = apiFetchText as jest.MockedFunction<typeof apiFetchText>;

describe('datos para el software de imagen (DX-484)', () => {
  it('pide el .txt con el token por el cliente de texto', async () => {
    mockedFetchText.mockResolvedValue('Código del paciente: 1042\r\n');
    await expect(fetchPatientImagingExport('tok', 'p1')).resolves.toBe('Código del paciente: 1042\r\n');
    expect(mockedFetchText).toHaveBeenCalledWith('/patients/p1/imaging-export.txt', { token: 'tok' });
  });

  it('el nombre del fichero lleva el código', () => {
    expect(imagingExportFileName('1042')).toBe('paciente-1042.txt');
  });

  it('solo DENTIST, ASSISTANT y ADMIN', () => {
    expect(canExportImaging('DENTIST')).toBe(true);
    expect(canExportImaging('ASSISTANT')).toBe(true);
    expect(canExportImaging('ADMIN')).toBe(true);
    expect(canExportImaging('RECEPTION')).toBe(false);
    expect(canExportImaging(null)).toBe(false);
  });
});

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
  const cov = { status: 'EXPIRED', payerName: 'Surco Salud', planName: null, validTo: '2026-01-31' };
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
  it('conserva el resumen de convenio (DX-105) si la mutación no lo trae', () => {
    const agr = { status: 'ACTIVE', agreementName: 'Convenio Surco', payerName: 'Surco Salud' } as const;
    const prev = { id: 'p1', agreement: agr } as unknown as Patient;
    const next = { id: 'p1', firstName: 'B' } as unknown as Patient;
    expect(replacePatientKeepingDerived(prev, next).agreement).toBe(agr);
    const fresh = { status: 'NONE', agreementName: null, payerName: null } as const;
    expect(replacePatientKeepingDerived(prev, { id: 'p1', agreement: fresh } as unknown as Patient).agreement).toBe(fresh);
  });
});

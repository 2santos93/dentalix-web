import {
  CLINICAL_RECORD_COPY_SECTIONS,
  canGenerateClinicalRecordCopy,
  clinicalRecordCopyPrintHref,
  generateClinicalRecordCopy,
  sectionsSummary,
} from './clinical-record-copies-api';
import { apiFetch } from '@/lib/api/client';

jest.mock('../api/client', () => ({ ...jest.requireActual('../api/client'), apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('clinical-record-copies-api (DX-456)', () => {
  it('resume las secciones en el orden del documento', () => {
    expect(sectionsSummary(['APPOINTMENTS', 'EVOLUTIONS'])).toBe('Evoluciones y adendas, Citas');
    expect(sectionsSummary(CLINICAL_RECORD_COPY_SECTIONS.map((s) => s.id))).toBe('Todas las secciones');
  });

  it('solo los roles clínicos y ADMIN generan la copia', () => {
    expect(canGenerateClinicalRecordCopy('DENTIST')).toBe(true);
    expect(canGenerateClinicalRecordCopy('ASSISTANT')).toBe(true);
    expect(canGenerateClinicalRecordCopy('ADMIN')).toBe(true);
    expect(canGenerateClinicalRecordCopy('RECEPTION')).toBe(false);
    expect(canGenerateClinicalRecordCopy(null)).toBe(false);
  });

  it('la vista imprimible vive fuera del shell', () => {
    expect(clinicalRecordCopyPrintHref('p1', 'c1')).toBe('/print/patients/p1/clinical-record-copies/c1');
  });

  it('genera con «entregado a» recortado, o null si va vacío', async () => {
    mockedFetch.mockResolvedValue({});
    await generateClinicalRecordCopy('tok', 'p1', { from: '2026-03-01', to: '2026-03-31', sections: ['EVOLUTIONS'], deliveredTo: '  Ana  ' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/clinical-record-copies', {
      method: 'POST',
      token: 'tok',
      body: { from: '2026-03-01', to: '2026-03-31', sections: ['EVOLUTIONS'], deliveredTo: 'Ana' },
    });
    await generateClinicalRecordCopy('tok', 'p1', { from: '2026-03-01', to: '2026-03-31', sections: ['EVOLUTIONS'], deliveredTo: '   ' });
    expect(mockedFetch.mock.calls.at(-1)?.[1]).toMatchObject({ body: { deliveredTo: null } });
  });
});

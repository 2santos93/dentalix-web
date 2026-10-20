import {
  canUploadPatientDocuments,
  canVoidPatientDocument,
  formatFileSize,
  getPatientDocumentUrl,
  listPatientDocuments,
  PATIENT_DOCUMENT_ACCEPT,
  PATIENT_DOCUMENT_CATEGORY_LABELS,
  uploadPatientDocument,
  validatePatientDocumentFile,
  voidPatientDocument,
} from './patient-documents-api';
import { apiFetch } from '@/lib/api/client';
import { uploadWithProgress } from '@/lib/api/upload';
import { makeDocument } from '@/lib/test/patient-documents';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('../api/upload', () => ({ uploadWithProgress: jest.fn() }));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedUpload = uploadWithProgress as jest.MockedFunction<typeof uploadWithProgress>;

const MB = 1024 * 1024;

describe('patient-documents-api (DX-151)', () => {
  beforeEach(() => {
    mockedFetch.mockReset().mockResolvedValue([]);
    mockedUpload.mockReset().mockResolvedValue(makeDocument());
  });

  it('etiquetas de categoría en español', () => {
    expect(PATIENT_DOCUMENT_CATEGORY_LABELS).toEqual({
      XRAY: 'Radiografía',
      PHOTO: 'Foto',
      REFERRAL: 'Remisión',
      SIGNED_CONSENT: 'Consentimiento firmado',
      REPORT: 'Informe',
      OTHER: 'Otro',
    });
  });

  it('lista sin filtros y con categoría y diente en la query', async () => {
    await listPatientDocuments('T', 'p 1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p%201/documents', { token: 'T' });
    await listPatientDocuments('T', 'p1', { category: 'XRAY', tooth: '11' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/documents?category=XRAY&tooth=11', {
      token: 'T',
    });
  });

  it('sube en multipart con dientes en CSV, fecha y notas, y pasa el progreso', async () => {
    const onProgress = jest.fn();
    const file = new File(['%PDF-'], 'remision.pdf', { type: 'application/pdf' });
    await uploadPatientDocument(
      'T',
      'p1',
      { file, category: 'REFERRAL', clinicalDate: '2026-10-01', toothNumbers: ['11', '21'], notes: '  ortodoncia ' },
      { onProgress },
    );
    const [path, form, opts] = mockedUpload.mock.calls[0];
    expect(path).toBe('/patients/p1/documents');
    expect(opts).toEqual({ token: 'T', onProgress });
    expect((form.get('file') as File).name).toBe('remision.pdf');
    expect(form.get('category')).toBe('REFERRAL');
    expect(form.get('clinicalDate')).toBe('2026-10-01');
    expect(form.get('toothNumbers')).toBe('11,21');
    expect(form.get('notes')).toBe('ortodoncia');
  });

  it('sin opcionales no manda esos campos', async () => {
    await uploadPatientDocument('T', 'p1', { file: new File(['x'], 'a.png'), category: 'OTHER' });
    const form = mockedUpload.mock.calls[0][1];
    expect(form.has('clinicalDate')).toBe(false);
    expect(form.has('toothNumbers')).toBe(false);
    expect(form.has('notes')).toBe(false);
  });

  it('URL inline y de descarga por rutas distintas; anular con motivo', async () => {
    await getPatientDocumentUrl('T', 'p1', 'd1', 'inline');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/documents/d1/url/inline', { token: 'T' });
    await getPatientDocumentUrl('T', 'p1', 'd1', 'attachment');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/documents/d1/url/download', { token: 'T' });
    await voidPatientDocument('T', 'p1', 'd1', 'Paciente equivocado');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/documents/d1/void', {
      method: 'POST',
      body: { reason: 'Paciente equivocado' },
      token: 'T',
    });
  });

  it('pre-chequeo: 21 MB, tipo fuera de la lista blanca, vacío; DICOM sin extensión pasa', () => {
    expect(validatePatientDocumentFile({ name: 'cbct.pdf', type: 'application/pdf', size: 21 * MB })).toBe(
      'El archivo supera el máximo de 20 MB.',
    );
    expect(validatePatientDocumentFile({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatch(
      /^Tipo de archivo no admitido/,
    );
    expect(validatePatientDocumentFile({ name: 'a.xlsx', type: '', size: 10 })).toMatch(/no admitido/);
    expect(validatePatientDocumentFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe(
      'El archivo está vacío.',
    );
    expect(validatePatientDocumentFile({ name: 'IM000001', type: '', size: 10 })).toBeNull();
    expect(validatePatientDocumentFile({ name: 'IMG_1.HEIC', type: '', size: 10 })).toBeNull();
    expect(validatePatientDocumentFile({ name: 'foto', type: 'image/jpeg', size: 20 * MB })).toBeNull();
    expect(PATIENT_DOCUMENT_ACCEPT).toContain('.dcm');
    expect(PATIENT_DOCUMENT_ACCEPT).toContain('application/pdf');
  });

  it('tamaños legibles', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1.5 * MB)).toBe('1,5 MB');
  });

  it('roles: los cuatro suben; anula el autor o ADMIN, y solo uno vivo', () => {
    expect(canUploadPatientDocuments('RECEPTION')).toBe(true);
    expect(canUploadPatientDocuments(null)).toBe(false);
    const doc = makeDocument({ uploadedById: 'u-rec' });
    expect(canVoidPatientDocument('RECEPTION', doc, 'u-rec')).toBe(true);
    expect(canVoidPatientDocument('DENTIST', doc, 'u-dentist')).toBe(false);
    expect(canVoidPatientDocument('ADMIN', doc, 'u-admin')).toBe(true);
    expect(canVoidPatientDocument('ADMIN', makeDocument({ voidedAt: '2026-10-11T00:00:00Z' }), 'u-admin')).toBe(
      false,
    );
    expect(canVoidPatientDocument(null, doc, 'u-rec')).toBe(false);
  });
});

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
import { STORAGE_UNREACHABLE_CODE, STORAGE_UNREACHABLE_MESSAGE, uploadToStorage } from '@/lib/api/upload';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { makeDocument } from '@/lib/test/patient-documents';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('../api/upload', () => ({ ...jest.requireActual('../api/upload'), uploadToStorage: jest.fn() }));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedUpload = uploadToStorage as jest.MockedFunction<typeof uploadToStorage>;

const TICKET = {
  documentId: 'd 1',
  method: 'POST' as const,
  url: 'https://bucket.example.com/dentalix-files',
  fields: { key: 'patient-documents/pending/t/d1' },
  expiresAt: '2026-10-21T12:05:00.000Z',
  maxBytes: 20 * 1024 * 1024,
};

/** File con `arrayBuffer` (jsdom no lo trae; el navegador sí). */
function fileOf(content: string, name: string, type?: string): File {
  const file = new File([content], name, type ? { type } : {});
  Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(Buffer.from(content)).buffer });
  return file;
}

/** SHA-256 de «%PDF-» en hex. */
const PDF_SHA = 'f0e3d8c46d6a0f1e3c3b8e0f4b6b2e1c9b8b4d6f8c6c2f8b7e0d5b0c7e9f4a1d';

const MB = 1024 * 1024;

describe('patient-documents-api (DX-151)', () => {
  beforeEach(() => {
    mockedFetch.mockReset().mockResolvedValue([]);
    mockedUpload.mockReset().mockResolvedValue(undefined);
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

  it('DX-259: pide la autorización, sube DIRECTO al almacén con progreso y completa con los campos', async () => {
    const digest = jest.fn(async () => Uint8Array.from(Buffer.from(PDF_SHA, 'hex')).buffer);
    Object.defineProperty(globalThis, 'crypto', { value: { subtle: { digest } }, configurable: true });
    mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockResolvedValueOnce(makeDocument({ id: 'd 1' }));
    mockedUpload.mockReset().mockImplementation(async (_t, _f, o) => {
      o?.onProgress?.(0.5);
      o?.onProgress?.(1);
    });
    const progress: number[] = [];
    const file = fileOf('%PDF-', 'remision.pdf', 'application/pdf');
    const doc = await uploadPatientDocument(
      'T',
      'p1',
      { file, category: 'REFERRAL', clinicalDate: '2026-10-01', toothNumbers: ['11', '21'], notes: '  ortodoncia ' },
      { onProgress: (p) => progress.push(p) },
    );
    expect(doc.id).toBe('d 1');
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.anything());
    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/patients/p1/documents/upload-url', {
      method: 'POST',
      token: 'T',
      body: { fileName: 'remision.pdf', mimeType: 'application/pdf', sizeBytes: 5, sha256: PDF_SHA },
    });
    expect(mockedUpload).toHaveBeenCalledWith(TICKET, file, { onProgress: expect.any(Function), signal: undefined });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/patients/p1/documents/d%201/complete', {
      method: 'POST',
      token: 'T',
      body: {
        category: 'REFERRAL',
        fileName: 'remision.pdf',
        mimeType: 'application/pdf',
        clinicalDate: '2026-10-01',
        toothNumbers: ['11', '21'],
        notes: 'ortodoncia',
      },
    });
    // La barra no llega a 1 hasta que la API crea el documento.
    expect(progress).toEqual([0.5, 0.99, 1]);
  });

  it('DX-259: sin opcionales no manda esos campos; si el almacén rechaza, no se completa', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: { digest: async () => new ArrayBuffer(32) } },
      configurable: true,
    });
    mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockResolvedValueOnce(makeDocument());
    mockedUpload.mockReset().mockResolvedValue(undefined);
    await uploadPatientDocument('T', 'p1', { file: fileOf('x', 'a.png'), category: 'OTHER' });
    expect(mockedFetch.mock.calls[1][1]?.body).toEqual({ category: 'OTHER', fileName: 'a.png', mimeType: '' });

    mockedFetch.mockReset().mockResolvedValueOnce(TICKET);
    mockedUpload.mockReset().mockRejectedValue(new Error('rechazado'));
    await expect(
      uploadPatientDocument('T', 'p1', { file: fileOf('x', 'a.png'), category: 'OTHER' }),
    ).rejects.toThrow('rechazado');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  describe('reintentos y fallos del almacén (revisión M-6, QA D1)', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'crypto', {
        value: { subtle: { digest: async () => new ArrayBuffer(32) } },
        configurable: true,
      });
    });
    const input = () => ({ file: fileOf('%PDF-', 'remision.pdf', 'application/pdf'), category: 'REFERRAL' as const });

    it('avisa del documentId en cuanto el fichero está en el almacén (antes de complete)', async () => {
      const stored: string[] = [];
      mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockRejectedValueOnce(new ApiError(503, 'x'));
      await expect(
        uploadPatientDocument('T', 'p1', input(), { onStored: (id) => stored.push(id) }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(stored).toEqual(['d 1']);
    });

    it('«Reintentar» con el fichero ya en el almacén repite primero el complete del mismo documento, sin otro ticket', async () => {
      mockedFetch.mockReset().mockResolvedValueOnce(makeDocument({ id: 'd 1' }));
      const doc = await uploadPatientDocument('T', 'p1', input(), { resumeDocumentId: 'd 1' });
      expect(doc.id).toBe('d 1');
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch.mock.calls[0][0]).toBe('/patients/p1/documents/d%201/complete');
      expect(mockedUpload).not.toHaveBeenCalled();
    });

    it('si ese complete da 404 (el pendiente caducó o nunca llegó), vuelve a subir desde el principio', async () => {
      mockedFetch
        .mockReset()
        .mockRejectedValueOnce(new ApiError(404, 'No encontramos el archivo subido'))
        .mockResolvedValueOnce(TICKET)
        .mockResolvedValueOnce(makeDocument({ id: 'd 1' }));
      const doc = await uploadPatientDocument('T', 'p1', input(), { resumeDocumentId: 'viejo' });
      expect(doc.id).toBe('d 1');
      expect(mockedFetch.mock.calls.map((c) => c[0])).toEqual([
        '/patients/p1/documents/viejo/complete',
        '/patients/p1/documents/upload-url',
        '/patients/p1/documents/d%201/complete',
      ]);
      expect(mockedUpload).toHaveBeenCalledTimes(1);
    });

    const unreachable = () => new ApiError(503, STORAGE_UNREACHABLE_MESSAGE, { code: STORAGE_UNREACHABLE_CODE });

    it('el almacén cortó la subida pero la API responde: es el 503 del almacén', async () => {
      mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockResolvedValueOnce({ status: 'ok' });
      mockedUpload.mockReset().mockRejectedValue(unreachable());
      const err = (await uploadPatientDocument('T', 'p1', input()).catch((e) => e)) as ApiError;
      expect(err.code).toBe(STORAGE_UNREACHABLE_CODE);
      expect(mockedFetch.mock.calls[1][0]).toBe('/health');
    });

    it('si tampoco responde la API, el problema es la conexión de la clínica: NetworkError', async () => {
      mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockRejectedValueOnce(new NetworkError(new Error('x')));
      mockedUpload.mockReset().mockRejectedValue(unreachable());
      await expect(uploadPatientDocument('T', 'p1', input())).rejects.toBeInstanceOf(NetworkError);
    });

    it('la señal de cancelar llega a la subida al almacén', async () => {
      mockedFetch.mockReset().mockResolvedValueOnce(TICKET).mockResolvedValueOnce(makeDocument());
      const controller = new AbortController();
      await uploadPatientDocument('T', 'p1', input(), { signal: controller.signal });
      expect(mockedUpload.mock.calls[0][2]?.signal).toBe(controller.signal);
    });
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

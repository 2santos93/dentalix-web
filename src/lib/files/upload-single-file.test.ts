import { createHash, webcrypto } from 'node:crypto';
import { apiFetch } from '@/lib/api/client';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { STORAGE_UNREACHABLE_CODE, STORAGE_UNREACHABLE_MESSAGE, uploadToStorage } from '@/lib/api/upload';
import { convertHeicToJpeg } from '@/lib/patient-documents/heic';
import {
  prepareSingleFile,
  uploadSingleFile,
  validateSingleFile,
  type SingleFileRules,
  type SingleFileUploadTicket,
} from './upload-single-file';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('../api/upload', () => ({ ...jest.requireActual('../api/upload'), uploadToStorage: jest.fn() }));
jest.mock('../patient-documents/heic', () => ({
  ...jest.requireActual('../patient-documents/heic'),
  convertHeicToJpeg: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedUpload = uploadToStorage as jest.MockedFunction<typeof uploadToStorage>;
const mockedHeic = convertHeicToJpeg as jest.MockedFunction<typeof convertHeicToJpeg>;

const MB = 1024 * 1024;

const RULES: SingleFileRules = {
  maxBytes: 20 * MB,
  extensions: ['pdf', 'jpg', 'jpeg', 'png', 'heic'],
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
  messages: { tooLarge: 'grande', empty: 'vacío', unsupported: 'tipo' },
};

const TICKET: SingleFileUploadTicket = {
  uploadId: 'up-1',
  target: { method: 'POST', url: 'https://bucket.example.com', fields: { key: 'expense-receipts/pending/t/up-1' } },
};

/** File con `arrayBuffer` (jsdom no lo trae; el navegador sí). */
function fileOf(content: string, name: string, type?: string): File {
  const file = new File([content], name, type ? { type } : {});
  Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(Buffer.from(content)).buffer });
  return file;
}

describe('validateSingleFile', () => {
  it('admite por extensión o por tipo MIME', () => {
    expect(validateSingleFile({ name: 'factura.PDF', type: '', size: 10 }, RULES)).toBeNull();
    expect(validateSingleFile({ name: 'scan', type: 'image/png', size: 10 }, RULES)).toBeNull();
  });

  it('rechaza vacío, demasiado grande y tipos fuera de la lista', () => {
    expect(validateSingleFile({ name: 'a.pdf', type: 'application/pdf', size: 0 }, RULES)).toBe('vacío');
    expect(validateSingleFile({ name: 'a.pdf', type: 'application/pdf', size: 20 * MB + 1 }, RULES)).toBe('grande');
    expect(validateSingleFile({ name: 'a.docx', type: 'application/msword', size: 10 }, RULES)).toBe('tipo');
    expect(validateSingleFile({ name: 'sin-extension', type: '', size: 10 }, RULES)).toBe('tipo');
  });
});

describe('prepareSingleFile', () => {
  it('pasa la HEIC a JPG y deja el resto tal cual', async () => {
    const jpeg = fileOf('jpg', 'IMG_1.jpg', 'image/jpeg');
    mockedHeic.mockResolvedValue(jpeg);
    await expect(prepareSingleFile(fileOf('x', 'IMG_1.HEIC', 'image/heic'))).resolves.toBe(jpeg);
    const pdf = fileOf('%PDF-', 'a.pdf', 'application/pdf');
    await expect(prepareSingleFile(pdf)).resolves.toBe(pdf);
    expect(mockedHeic).toHaveBeenCalledTimes(1);
  });
});

describe('uploadSingleFile', () => {
  // jsdom no trae Web Crypto: la huella se calcula con la de Node.
  const realCrypto = globalThis.crypto;
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedUpload.mockReset().mockResolvedValue(undefined);
  });

  it('pide la autorización con nombre, tipo, tamaño y huella y sube al almacén', async () => {
    const requestTicket = jest.fn().mockResolvedValue(TICKET);
    const onProgress = jest.fn();
    const controller = new AbortController();
    const uploadId = await uploadSingleFile(fileOf('%PDF-', 'luz.pdf', 'application/pdf'), requestTicket, {
      onProgress,
      signal: controller.signal,
    });
    expect(uploadId).toBe('up-1');
    expect(requestTicket).toHaveBeenCalledWith({
      name: 'luz.pdf',
      mimeType: 'application/pdf',
      size: 5,
      sha256: createHash('sha256').update('%PDF-').digest('hex'),
    });
    expect(mockedUpload).toHaveBeenCalledWith(TICKET.target, expect.any(File), {
      onProgress,
      signal: controller.signal,
    });
  });

  it('sin tipo MIME no lo manda', async () => {
    const requestTicket = jest.fn().mockResolvedValue(TICKET);
    await uploadSingleFile(fileOf('x', 'scan.png'), requestTicket);
    expect(requestTicket.mock.calls[0][0]).not.toHaveProperty('mimeType');
  });

  const unreachable = () => new ApiError(503, STORAGE_UNREACHABLE_MESSAGE, { code: STORAGE_UNREACHABLE_CODE });

  it('el almacén cortó pero la API responde: es el 503 del almacén', async () => {
    mockedUpload.mockRejectedValue(unreachable());
    mockedFetch.mockResolvedValue({ status: 'ok' });
    const err = await uploadSingleFile(fileOf('x', 'a.pdf'), async () => TICKET).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe(STORAGE_UNREACHABLE_CODE);
    expect(mockedFetch).toHaveBeenCalledWith('/health');
  });

  it('si tampoco responde la API, es la conexión: NetworkError', async () => {
    mockedUpload.mockRejectedValue(unreachable());
    mockedFetch.mockRejectedValue(new NetworkError(new Error('x')));
    await expect(uploadSingleFile(fileOf('x', 'a.pdf'), async () => TICKET)).rejects.toBeInstanceOf(NetworkError);
  });
});

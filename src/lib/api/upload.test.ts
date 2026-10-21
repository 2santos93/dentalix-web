/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://acme.localhost:3001"}
 */
import { storageUploadError, uploadToStorage } from './upload';
import { ApiError, NetworkError } from './client';

/** XHR falso: guarda lo enviado y deja que el test decida la respuesta. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static respond: (xhr: FakeXhr) => void = () => {};
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  responseText = '';
  responseHeaders: Record<string, string> = {};
  withCredentials = true;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name] ?? null;
  }
  send(body: FormData) {
    this.body = body;
    queueMicrotask(() => FakeXhr.respond(this));
  }
  reply(status: number, text = '') {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

const realXhr = global.XMLHttpRequest;
beforeEach(() => {
  FakeXhr.instances = [];
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
});
afterEach(() => {
  global.XMLHttpRequest = realXhr;
});

const TARGET = {
  method: 'POST' as const,
  url: 'https://bucket.example.com/dentalix-files',
  fields: { key: 'patient-documents/pending/t/d', Policy: 'p', 'x-amz-checksum-sha256': 'abc=' },
};

describe('uploadToStorage (DX-259)', () => {
  it('POST directo al bucket: campos en orden y el fichero al final, sin Authorization ni cookies', async () => {
    FakeXhr.respond = (xhr) => xhr.reply(204);
    const file = new Blob(['%PDF-1.7']);
    await uploadToStorage(TARGET, file);
    const [xhr] = FakeXhr.instances;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://bucket.example.com/dentalix-files');
    expect(xhr.headers).toEqual({});
    expect(xhr.withCredentials).toBe(false);
    const names = [...(xhr.body as FormData).keys()];
    expect(names).toEqual(['key', 'Policy', 'x-amz-checksum-sha256', 'file']);
  });

  it('informa el progreso de la subida y termina en 1', async () => {
    const progress: number[] = [];
    FakeXhr.respond = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      xhr.reply(204);
    };
    await uploadToStorage(TARGET, new Blob(['x']), { onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.25, 1, 1]);
  });

  it('el XML de error de S3 sale como ApiError con el mensaje en español', async () => {
    FakeXhr.respond = (xhr) =>
      xhr.reply(400, '<?xml version="1.0"?><Error><Code>EntityTooLarge</Code><Message>x</Message></Error>');
    const err = (await uploadToStorage(TARGET, new Blob(['x'])).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.messages).toEqual(['El archivo supera el máximo de 20 MB.']);
    expect(err.code).toBe('EntityTooLarge');
  });

  it('un fallo de red (o de CORS) es NetworkError', async () => {
    FakeXhr.respond = (xhr) => xhr.onerror?.();
    await expect(uploadToStorage(TARGET, new Blob(['x']))).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('storageUploadError', () => {
  it('con el almacén en disco responde la API: su JSON en español y el Retry-After', () => {
    const err = storageUploadError(
      503,
      JSON.stringify({ statusCode: 503, message: 'Hay demasiadas subidas en curso. Inténtalo de nuevo en unos segundos.' }),
      '5',
    );
    expect(err.status).toBe(503);
    expect(err.retryAfterSeconds).toBe(5);
    expect(err.messages).toEqual(['Hay demasiadas subidas en curso. Inténtalo de nuevo en unos segundos.']);
  });

  it('una política caducada (403) y un código desconocido tienen su texto; nunca el XML', () => {
    expect(storageUploadError(403, '<Error><Code>AccessDenied</Code></Error>', null).messages).toEqual([
      'La autorización para subir el archivo caducó. Vuelve a intentarlo.',
    ]);
    expect(storageUploadError(400, '<Error><Code>Raro</Code></Error>', null).messages).toEqual([
      'No pudimos subir el archivo al almacén. Vuelve a intentarlo.',
    ]);
    expect(storageUploadError(503, '', null).status).toBe(503);
  });
});

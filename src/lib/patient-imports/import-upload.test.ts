/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://acme.localhost:3001"}
 */
import { uploadImportFile } from './import-upload';
import { ApiError, NetworkError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getActiveLocationId, setActiveLocationId } from '@/lib/locations/location-store';

/** XHR falso: guarda lo enviado y deja que el test decida la respuesta. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static respond: (xhr: FakeXhr) => void = () => {};
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = '';
  responseHeaders: Record<string, string> = {};
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
  abort() {
    this.onabort?.();
  }
  send(body: unknown) {
    this.body = body;
    queueMicrotask(() => FakeXhr.respond(this));
  }
  reply(status: number, json: unknown) {
    this.status = status;
    this.responseText = json === undefined ? '' : JSON.stringify(json);
    this.onload?.();
  }
}

const realXhr = global.XMLHttpRequest;
const realFetch = global.fetch;

beforeEach(() => {
  FakeXhr.instances = [];
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  setActiveLocationId(null);
  useAuthStore.setState({ accessToken: null, _hasHydrated: true });
});
afterEach(() => {
  global.XMLHttpRequest = realXhr;
  global.fetch = realFetch;
});

describe('uploadImportFile (DX-107 × DX-259)', () => {
  it('sube el multipart a la ruta de subida de la web, NO al proxy /api/v1 (tope de 1 MB), con las cabeceras de doFetch', async () => {
    setActiveLocationId('loc-9');
    FakeXhr.respond = (xhr) => xhr.reply(200, { headers: ['a'] });
    const form = new FormData();
    form.append('mapping', '{}');

    const out = await uploadImportFile<{ headers: string[] }>('inspect', form, { token: 'T' });

    expect(out).toEqual({ headers: ['a'] });
    const [xhr] = FakeXhr.instances;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/import-upload/inspect');
    expect(xhr.body).toBe(form);
    expect(xhr.headers).toEqual({
      Authorization: 'Bearer T',
      'X-Tenant-Host': 'acme.localhost:3001',
      'X-Refresh-Transport': 'cookie',
      'X-Location-Id': 'loc-9',
    });
  });

  it('el dry-run va a su propia ruta de subida', async () => {
    FakeXhr.respond = (xhr) => xhr.reply(201, { id: 'b1' });
    await uploadImportFile('validate', new FormData(), { token: 'T' });
    expect(FakeXhr.instances[0].url).toBe('/api/import-upload/validate');
  });

  it('informa el progreso de la subida y termina en 1', async () => {
    const progress: number[] = [];
    FakeXhr.respond = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      xhr.reply(200, {});
    };
    await uploadImportFile('inspect', new FormData(), { token: 'T', onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.25, 1, 1]);
  });

  it('con 401 renueva el access token una vez y repite la subida con el nuevo (progreso desde 0)', async () => {
    const fetchSpy = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW' }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const progress: number[] = [];
    let hits = 0;
    FakeXhr.respond = (xhr) => {
      hits += 1;
      if (hits === 1) xhr.reply(401, { message: 'Invalid token' });
      else xhr.reply(200, { ok: 1 });
    };

    const out = await uploadImportFile('inspect', new FormData(), {
      token: 'OLD',
      onProgress: (p) => progress.push(p),
    });

    expect(out).toEqual({ ok: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.instances[1].headers.Authorization).toBe('Bearer NEW');
    expect(progress).toEqual([0, 1]);
  });

  it('un segundo 401 ya no renueva: lanza ApiError', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW' }),
    })) as unknown as typeof fetch;
    FakeXhr.respond = (xhr) => xhr.reply(401, { message: 'Invalid token' });
    await expect(uploadImportFile('inspect', new FormData(), { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('error de la API (413 de 5 MB en español) → ApiError con status y mensaje', async () => {
    FakeXhr.respond = (xhr) =>
      xhr.reply(413, { statusCode: 413, message: 'El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.' });
    const err = (await uploadImportFile('validate', new FormData(), { token: 'T' }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.messages).toEqual(['El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.']);
  });

  it('sin cuerpo JSON sigue siendo ApiError con el status', async () => {
    FakeXhr.respond = (xhr) => {
      xhr.status = 502;
      xhr.responseText = '<html>Bad gateway</html>';
      xhr.onload?.();
    };
    const err = (await uploadImportFile('inspect', new FormData(), { token: 'T' }).catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.messages).toEqual([]);
  });

  it('sede huérfana (400 «Unknown location»): suelta la sede y repite UNA vez sin X-Location-Id', async () => {
    setActiveLocationId('loc-borrada');
    let hits = 0;
    FakeXhr.respond = (xhr) => {
      hits += 1;
      if (hits === 1) xhr.reply(400, { message: 'Unknown location for this tenant' });
      else xhr.reply(201, { id: 'b1' });
    };
    const out = await uploadImportFile('validate', new FormData(), { token: 'T' });
    expect(out).toEqual({ id: 'b1' });
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.instances[0].headers['X-Location-Id']).toBe('loc-borrada');
    expect(FakeXhr.instances[1].headers['X-Location-Id']).toBeUndefined();
    expect(getActiveLocationId()).toBeNull();
  });

  it('sin sede enviada, un 400 «Unknown location» no se reintenta', async () => {
    FakeXhr.respond = (xhr) => xhr.reply(400, { message: 'Unknown location' });
    await expect(uploadImportFile('inspect', new FormData(), { token: 'T' })).rejects.toBeInstanceOf(ApiError);
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('fallo de red → NetworkError', async () => {
    FakeXhr.respond = (xhr) => xhr.onerror?.();
    await expect(uploadImportFile('inspect', new FormData(), { token: 'T' })).rejects.toBeInstanceOf(NetworkError);
  });
});

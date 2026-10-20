/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://acme.localhost:3001"}
 */
import { uploadWithProgress } from './upload';
import { ApiError, NetworkError } from './client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { setActiveLocationId } from '@/lib/locations/location-store';

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
  withCredentials = false;
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

describe('uploadWithProgress (DX-151)', () => {
  it('POST multipart al proxy del mismo origen con las cabeceras de doFetch y sin Content-Type', async () => {
    setActiveLocationId('loc-9');
    FakeXhr.respond = (xhr) => xhr.reply(201, { id: 'd1' });
    const form = new FormData();
    form.append('category', 'XRAY');

    const out = await uploadWithProgress<{ id: string }>('/patients/p1/documents', form, { token: 'T' });

    expect(out).toEqual({ id: 'd1' });
    const [xhr] = FakeXhr.instances;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/v1/patients/p1/documents');
    expect(xhr.body).toBe(form);
    expect(xhr.headers).toEqual({
      Authorization: 'Bearer T',
      'X-Tenant-Host': 'acme.localhost:3001',
      'X-Refresh-Transport': 'cookie',
      'X-Location-Id': 'loc-9',
    });
  });

  it('informa el progreso de la subida y termina en 1', async () => {
    const progress: number[] = [];
    FakeXhr.respond = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      xhr.reply(201, { id: 'd1' });
    };
    await uploadWithProgress('/x', new FormData(), { token: 'T', onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.25, 1, 1]);
  });

  it('con 401 renueva el access token una vez y repite la subida con el nuevo', async () => {
    const fetchSpy = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW' }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    let hits = 0;
    FakeXhr.respond = (xhr) => {
      hits += 1;
      if (hits === 1) xhr.reply(401, { message: 'Invalid token' });
      else xhr.reply(201, { id: 'd1' });
    };

    const out = await uploadWithProgress('/patients/p1/documents', new FormData(), { token: 'OLD' });

    expect(out).toEqual({ id: 'd1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.instances[1].headers.Authorization).toBe('Bearer NEW');
  });

  it('un segundo 401 ya no renueva: lanza ApiError', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW' }),
    })) as unknown as typeof fetch;
    FakeXhr.respond = (xhr) => xhr.reply(401, { message: 'Invalid token' });
    await expect(uploadWithProgress('/x', new FormData(), { token: 'OLD' })).rejects.toBeInstanceOf(ApiError);
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('error de la API → ApiError con status, messages y code', async () => {
    FakeXhr.respond = (xhr) =>
      xhr.reply(409, { message: 'Este archivo ya está en la ficha del paciente.', code: 'DUPLICATE' });
    const err = (await uploadWithProgress('/x', new FormData(), { token: 'T' }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.messages).toEqual(['Este archivo ya está en la ficha del paciente.']);
    expect(err.code).toBe('DUPLICATE');
  });

  it('sin cuerpo JSON (proxy caído) sigue siendo ApiError con el status', async () => {
    FakeXhr.respond = (xhr) => {
      xhr.status = 502;
      xhr.responseText = '<html>Bad gateway</html>';
      xhr.onload?.();
    };
    const err = (await uploadWithProgress('/x', new FormData(), { token: 'T' }).catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.messages).toEqual([]);
  });

  it('fallo de red → NetworkError', async () => {
    FakeXhr.respond = (xhr) => xhr.onerror?.();
    await expect(uploadWithProgress('/x', new FormData(), { token: 'T' })).rejects.toBeInstanceOf(NetworkError);
  });
});

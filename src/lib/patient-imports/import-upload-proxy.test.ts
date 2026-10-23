/**
 * @jest-environment node
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  forwardImportUpload,
  IMPORT_UPLOAD_MAX_BODY_BYTES,
} from './import-upload-proxy';
import { MAX_IMPORT_BYTES } from './import-upload-routes';

/** API falsa: guarda lo que recibe y responde lo que diga el test. */
interface Received {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}
type Handler = (req: http.IncomingMessage, res: http.ServerResponse, received: Received) => void;

let server: http.Server;
let apiUrl: string;
let handler: Handler;
let received: Received[];
const sockets = new Set<import('node:net').Socket>();

function readAll(req: http.IncomingMessage, into: Received, done: () => void) {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    into.body = Buffer.concat(chunks);
    done();
  });
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const r: Received = { method: req.method, url: req.url, headers: req.headers, body: Buffer.alloc(0) };
    received.push(r);
    handler(req, res, r);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received = [];
  handler = (req, res, r) =>
    readAll(req, r, () => {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-powered-by', 'Express');
      res.end(JSON.stringify({ ok: true }));
    });
});

function uploadRequest(
  url: string,
  headers: Record<string, string>,
  body: BodyInit | null = 'x'.repeat(10),
): Request {
  return new Request(url, { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
}

const SESSION = {
  host: 'demo.dentalix.app',
  authorization: 'Bearer T',
  'content-type': 'multipart/form-data; boundary=abc',
  'content-length': '10',
};

describe('forwardImportUpload (DX-107 × DX-259)', () => {
  it('el tope es el de la API (5 MB) más el margen del multipart, no el 1 MB del proxy', () => {
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
    expect(IMPORT_UPLOAD_MAX_BODY_BYTES).toBe(MAX_IMPORT_BYTES + 64 * 1024);
  });

  it('reenvía el cuerpo a la ruta de la API con las cabeceras de la sesión y el host de la clínica', async () => {
    const req = uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', {
      ...SESSION,
      'x-location-id': 'loc-1',
      'x-tenant-host': 'demo.dentalix.app',
      'x-forwarded-host': 'otra.dentalix.app',
      cookie: 'dentalix_refresh=secreto',
    });
    const res = await forwardImportUpload(req, 'inspect', { apiUrl });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('x-powered-by')).toBeNull();

    const [got] = received;
    expect(got.method).toBe('POST');
    expect(got.url).toBe('/api/v1/patient-imports/inspect');
    expect(got.body.toString()).toBe('x'.repeat(10));
    expect(got.headers.authorization).toBe('Bearer T');
    expect(got.headers['content-type']).toBe('multipart/form-data; boundary=abc');
    expect(got.headers['content-length']).toBe('10');
    expect(got.headers['transfer-encoding']).toBeUndefined();
    expect(got.headers['x-location-id']).toBe('loc-1');
    expect(got.headers['x-tenant-host']).toBe('demo.dentalix.app');
    // Como el rewrite: el tenant sale del host de la clínica, no del que mande el cliente.
    expect(got.headers['x-forwarded-host']).toBe('demo.dentalix.app');
    // La cookie del refresh no hace falta (va el bearer) y no sale hacia la API.
    expect(got.headers.cookie).toBeUndefined();
  });

  it('el dry-run va a POST /patient-imports y pasa el 201 y el Retry-After', async () => {
    handler = (req, res, r) =>
      readAll(req, r, () => {
        res.writeHead(201, { 'content-type': 'application/json', 'retry-after': '5' });
        res.end('{"id":"b1"}');
      });
    const res = await forwardImportUpload(
      uploadRequest('http://demo.dentalix.app/api/import-upload/validate', SESSION),
      'validate',
      { apiUrl: `${apiUrl}/` },
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(await res.json()).toEqual({ id: 'b1' });
    expect(received[0].url).toBe('/api/v1/patient-imports');
  });

  it('la hoja de saldos (DX-262) va a POST /patient-imports/:id/balances', async () => {
    const id = '0b6f1c1e-2a3b-4c5d-8e9f-001122334455';
    const res = await forwardImportUpload(
      uploadRequest(`http://demo.dentalix.app/api/import-upload/balances/${id}`, SESSION),
      { balancesOf: id },
      { apiUrl },
    );
    expect(res.status).toBe(200);
    expect(received[0].url).toBe(`/api/v1/patient-imports/${id}/balances`);
  });

  it('hoja de saldos con un id que no es un UUID: 400 en español sin llamar a la API', async () => {
    const res = await forwardImportUpload(
      uploadRequest('http://demo.dentalix.app/api/import-upload/balances/x', SESSION),
      { balancesOf: '../../auth/login' },
      { apiUrl },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe(
      'El lote de importación no es válido. Vuelve a subir el archivo de pacientes.',
    );
    expect(received).toHaveLength(0);
  });

  it('sin bearer (y tamaño dentro del tope): 401 en español sin leer el cuerpo ni llamar a la API (anónimos fuera)', async () => {
    const { authorization: _omit, ...anonymous } = SESSION;
    void _omit;
    const req = uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', anonymous);

    const res = await forwardImportUpload(req, 'inspect', { apiUrl });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Tu sesión terminó. Vuelve a iniciar sesión para importar pacientes.',
    });
    // Cuerpo ya acotado a 5 MB: Node lo descarta y el navegador lee el 401.
    expect(res.headers.get('connection')).toBeNull();
    expect(req.bodyUsed).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('un Authorization que no es bearer cuenta como anónimo', async () => {
    const res = await forwardImportUpload(
      uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', { ...SESSION, authorization: 'Basic eDp5' }),
      'inspect',
      { apiUrl },
    );
    expect(res.status).toBe(401);
    expect(received).toHaveLength(0);
  });

  it('más de 5 MB (+ margen) por Content-Length: 413 en español sin leer el cuerpo ni llamar a la API', async () => {
    const req = uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', {
      ...SESSION,
      'content-length': String(IMPORT_UPLOAD_MAX_BODY_BYTES + 1),
    });

    const res = await forwardImportUpload(req, 'inspect', { apiUrl });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.',
    });
    expect(res.headers.get('connection')).toBe('close');
    expect(req.bodyUsed).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('justo en el tope sí pasa', async () => {
    const size = IMPORT_UPLOAD_MAX_BODY_BYTES;
    const res = await forwardImportUpload(
      uploadRequest(
        'http://demo.dentalix.app/api/import-upload/inspect',
        { ...SESSION, 'content-length': String(size) },
        new Uint8Array(size),
      ),
      'inspect',
      { apiUrl },
    );
    expect(res.status).toBe(200);
    expect(received[0].body.length).toBe(size);
  });

  it('sin Content-Length (chunked) o con uno inválido: 411 sin llamar a la API', async () => {
    const { 'content-length': _cl, ...noLength } = SESSION;
    void _cl;
    for (const headers of [noLength, { ...SESSION, 'content-length': 'abc' }, { ...SESSION, 'content-length': '-1' }]) {
      const res = await forwardImportUpload(
        uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', headers),
        'inspect',
        { apiUrl },
      );
      expect(res.status).toBe(411);
      expect(((await res.json()) as { message: string }).message).toBe(
        'No pudimos subir el archivo. Vuelve a intentarlo.',
      );
    }
    expect(received).toHaveLength(0);
  });

  it('API caída: 502 en español con el formato de errores de la API', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const res = await forwardImportUpload(
      uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', SESSION),
      'inspect',
      { apiUrl: `http://127.0.0.1:${port}/api/v1` },
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'No pudimos conectar con el servidor. Vuelve a intentarlo en unos minutos.',
    });
  });

  it('API sin responder durante el plazo de inactividad: 504 en español', async () => {
    handler = (req, _res, r) => readAll(req, r, () => {});
    const res = await forwardImportUpload(
      uploadRequest('http://demo.dentalix.app/api/import-upload/inspect', SESSION),
      'inspect',
      { apiUrl, idleTimeoutMs: 100 },
    );
    expect(res.status).toBe(504);
    expect(((await res.json()) as { message: string }).message).toBe(
      'El servidor tardó demasiado en responder. Vuelve a intentarlo.',
    );
  });
});

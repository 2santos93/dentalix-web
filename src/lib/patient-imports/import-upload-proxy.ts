import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { API_URL } from '@/lib/api/api-base';
import { IMPORT_UPLOAD_ROUTES, MAX_IMPORT_BYTES, type ImportUploadStep } from './import-upload-routes';

/**
 * Subida del archivo de la importación de pacientes hacia la API (DX-107 ×
 * DX-259), en el SERVIDOR de la web (`src/app/api/import-upload/*`).
 *
 * Por qué no va por el rewrite `/api/v1`: Next copia en memoria el cuerpo de
 * cada petición que reescribe (o que pasa por `proxy.ts`) hasta
 * `proxyClientMaxBodySize`, un valor GLOBAL (no hay tope por ruta). DX-259 lo
 * dejó en 1 MB para que nadie, anónimos incluidos, pueda llenar la memoria de
 * la web, y la importación sube hasta 5 MB. Estas rutas están fuera del
 * rewrite y del matcher de `proxy.ts`, así que Next no copia su cuerpo: aquí
 * se pasa a la API en streaming CON CONTRAPRESIÓN (`node:http` + `pipeline`)
 * y la web solo tiene en memoria el trozo que está reenviando. Con `fetch`
 * (undici) no vale: lee el cuerpo de la petición sin esperar a que la API lo
 * consuma (medido en `next start` con la API parada y 20 subidas de 5 MB: con
 * `fetch`, 90 MB retenidos en la web; así, 2 MB).
 *
 * Antes de tocar el cuerpo se exige un `Content-Length` de como mucho 5 MB
 * más el margen del multipart (si no, 411 o 413 en español) y un bearer (sin
 * sesión, 401), así que un anónimo ni siquiera abre conexión con la API.
 * El JWT, el rol (solo ADMIN), el tenant por el host y el tope exacto de 5 MB
 * los sigue comprobando la API, como con cualquier otra petición.
 */

/** Margen para las partes del multipart que no son el archivo (mapeo ≤ 8 KB, cabeceras). */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const IMPORT_UPLOAD_MAX_BODY_BYTES = MAX_IMPORT_BYTES + MULTIPART_OVERHEAD_BYTES;

/**
 * Sin ningún avance en el socket con la API (ni del cuerpo ni de su
 * respuesta) durante esto, la petición se corta: el mismo plazo y la misma
 * semántica que `proxyTimeout` del rewrite (una subida lenta pero viva no se
 * corta).
 */
export const IMPORT_UPLOAD_IDLE_TIMEOUT_MS = 30_000;

/** Cabeceras de la petición que viajan a la API (las demás, cookies incluidas, no). */
const FORWARDED_HEADERS = [
  'authorization',
  'content-type',
  'content-length',
  'accept',
  'accept-language',
  'user-agent',
  'x-location-id',
  'x-tenant-host',
  'x-forwarded-for',
  'x-forwarded-proto',
] as const;

/** Cabeceras de la respuesta de la API que vuelven al navegador. */
const RETURNED_HEADERS = ['content-type', 'retry-after', 'cache-control'] as const;

const NO_SESSION_MESSAGE = 'Tu sesión terminó. Vuelve a iniciar sesión para importar pacientes.';
const NO_LENGTH_MESSAGE = 'No pudimos subir el archivo. Vuelve a intentarlo.';
/** El mismo texto que el 413 de la API (FILE_TOO_LARGE_MESSAGE). */
const TOO_LARGE_MESSAGE = 'El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.';
const UNREACHABLE_MESSAGE = 'No pudimos conectar con el servidor. Vuelve a intentarlo en unos minutos.';
const TIMEOUT_MESSAGE = 'El servidor tardó demasiado en responder. Vuelve a intentarlo.';

/** Error con el formato de la API (`{ statusCode, error, message }`). */
function apiError(statusCode: number, error: string, message: string, close = false): Response {
  return Response.json(
    { statusCode, error, message },
    { status: statusCode, headers: close ? { Connection: 'close' } : undefined },
  );
}

export interface ForwardImportUploadOptions {
  /** URL de la API (`NEXT_PUBLIC_API_URL`); solo los tests la cambian. */
  apiUrl?: string;
  idleTimeoutMs?: number;
}

class UpstreamTimeoutError extends Error {}

/** La respuesta de la API, en streaming hacia el navegador. */
function toResponse(upstream: http.IncomingMessage): Response {
  const headers = new Headers();
  for (const name of RETURNED_HEADERS) {
    const value = upstream.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const status = upstream.statusCode ?? 502;
  const body = status === 204 || status === 304 ? null : (Readable.toWeb(upstream) as ReadableStream<Uint8Array>);
  if (!body) upstream.resume();
  return new Response(body, { status, headers });
}

export async function forwardImportUpload(
  req: Request,
  step: ImportUploadStep,
  opts: ForwardImportUploadOptions = {},
): Promise<Response> {
  // Rechazos ANTES de leer el cuerpo. Sin tamaño o con más del tope, además
  // se cierra la conexión (no se lee un cuerpo de tamaño desconocido o
  // grande); sin sesión, el cuerpo ya está acotado y Node lo descarta sin
  // guardarlo, así el navegador llega a leer el 401.
  const rawLength = req.headers.get('content-length');
  const length = rawLength !== null && /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
  if (!Number.isSafeInteger(length) || !req.body) {
    return apiError(411, 'Length Required', NO_LENGTH_MESSAGE, true);
  }
  if (length > IMPORT_UPLOAD_MAX_BODY_BYTES) {
    return apiError(413, 'Payload Too Large', TOO_LARGE_MESSAGE, true);
  }
  if (!/^Bearer \S+$/.test(req.headers.get('authorization') ?? '')) {
    return apiError(401, 'Unauthorized', NO_SESSION_MESSAGE);
  }

  const headers: http.OutgoingHttpHeaders = {};
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  // Como el rewrite: la API saca el tenant del host de la clínica (con
  // TRUST_PROXY), nunca de un X-Forwarded-Host que mande el cliente.
  headers['x-forwarded-host'] = req.headers.get('host') ?? '';

  const target = new URL(`${(opts.apiUrl ?? API_URL).replace(/\/+$/, '')}${IMPORT_UPLOAD_ROUTES[step].api}`);
  const client = target.protocol === 'https:' ? https : http;
  const body = Readable.fromWeb(req.body as import('node:stream/web').ReadableStream<Uint8Array>);
  try {
    const upstream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const outgoing = client.request(target, { method: 'POST', headers, signal: req.signal }, resolve);
      outgoing.setTimeout(opts.idleTimeoutMs ?? IMPORT_UPLOAD_IDLE_TIMEOUT_MS, () =>
        outgoing.destroy(new UpstreamTimeoutError()),
      );
      outgoing.on('error', reject);
      // La API puede responder antes de leerlo todo (401, 413…): un fallo al
      // escribir el resto no es el de la petición.
      pipeline(body, outgoing).catch(() => {});
    });
    return toResponse(upstream);
  } catch (err) {
    body.destroy();
    if (err instanceof UpstreamTimeoutError) return apiError(504, 'Gateway Timeout', TIMEOUT_MESSAGE);
    return apiError(502, 'Bad Gateway', UNREACHABLE_MESSAGE);
  }
}

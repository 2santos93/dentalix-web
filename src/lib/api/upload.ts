import { ApiError, NetworkError } from './api-error';
import { apiErrorFromBody, apiFetch } from './client';

/**
 * Formulario de subida directa al almacén que da la API (DX-259): el POST
 * prefirmado de S3 (o, con el almacén en disco, la ruta `/files/uploads` de
 * la API, con el mismo formato).
 */
export interface StorageUploadTarget {
  method: 'POST';
  url: string;
  fields: Record<string, string>;
}

export interface StorageUploadOptions {
  /** Fracción enviada (0..1). */
  onProgress?: (fraction: number) => void;
  /** Cancela la subida (botón «Cancelar»): rechaza con `AbortError`. */
  signal?: AbortSignal;
  /**
   * Sin ningún avance durante esto (ms), el almacén se da por colgado: se
   * cancela y es el 503 del almacén (QA D2). Por defecto 30 s.
   */
  stallTimeoutMs?: number;
}

/** QA D2: plazo sin avance de la subida antes de darla por colgada. */
export const STORAGE_STALL_TIMEOUT_MS = 30_000;

/**
 * QA D1/D2: el almacén cortó la conexión o dejó de responder mientras el
 * navegador, que sí tiene red, subía. Es el mismo 503 que da la API cuando el
 * almacén no responde, no un «sin conexión» de la clínica.
 */
export const STORAGE_UNREACHABLE_CODE = 'STORAGE_UNREACHABLE';
export const STORAGE_UNREACHABLE_MESSAGE = 'El almacén de archivos no responde. Inténtalo de nuevo en unos minutos.';

function storageUnreachable(): ApiError {
  return new ApiError(503, STORAGE_UNREACHABLE_MESSAGE, { code: STORAGE_UNREACHABLE_CODE });
}

/** `navigator.onLine` false: el navegador sabe que no tiene red. */
function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Lo que dice el almacén cuando rechaza una subida (XML de S3). */
const S3_ERROR_MESSAGES: Record<string, string> = {
  EntityTooLarge: 'El archivo supera el máximo de 20 MB.',
  EntityTooSmall: 'El archivo está vacío.',
  XAmzContentChecksumMismatch: 'El archivo cambió mientras se subía. Vuelve a intentarlo.',
  BadDigest: 'El archivo cambió mientras se subía. Vuelve a intentarlo.',
  AccessDenied: 'La autorización para subir el archivo caducó. Vuelve a intentarlo.',
};

const STORAGE_UPLOAD_FAILED = 'No pudimos subir el archivo al almacén. Vuelve a intentarlo.';

/** `<Code>EntityTooLarge</Code>` del XML de error de S3, si lo hay. */
function s3ErrorCode(text: string): string | null {
  return /<Code>([A-Za-z]+)<\/Code>/.exec(text)?.[1] ?? null;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** El rechazo del almacén como `ApiError`, con el mensaje en español. */
export function storageUploadError(status: number, text: string, retryAfter: string | null): ApiError {
  const json = parseJson(text);
  if (json && typeof json === 'object' && 'message' in json) {
    // Con el almacén en disco responde la API (JSON en español).
    return apiErrorFromBody(status, json, retryAfter);
  }
  const code = s3ErrorCode(text);
  const message = (code && S3_ERROR_MESSAGES[code]) ?? STORAGE_UPLOAD_FAILED;
  return new ApiError(status >= 500 ? status : 400, message, { code });
}

/**
 * Sube `file` al almacén con el formulario de la API (DX-259): los `fields`
 * en su orden y el fichero AL FINAL, en `file` (S3 ignora lo que va
 * después). Por XHR porque `fetch` no informa del progreso de la subida.
 *
 * Va directo al bucket: ni por el proxy `/api/v1` de la web ni por la API,
 * así que sin `Authorization` ni cookies (la autorización va firmada en los
 * campos). Un rechazo es un `ApiError` con el mensaje en español. Una
 * conexión cortada o un almacén colgado (sin avance durante
 * `stallTimeoutMs`) son el 503 del almacén (`STORAGE_UNREACHABLE_CODE`); solo
 * si el navegador no tiene red (`navigator.onLine` false) es `NetworkError`.
 * Cancelar con `signal` rechaza con `AbortError`.
 */
export function uploadToStorage(
  target: StorageUploadTarget,
  file: Blob,
  opts: StorageUploadOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { signal } = opts;
    if (signal?.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    const stallMs = opts.stallTimeoutMs ?? STORAGE_STALL_TIMEOUT_MS;
    let stalled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, stallMs);
    };
    const onCancel = () => xhr.abort();
    const settle = (fn: () => void) => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onCancel);
      fn();
    };
    xhr.open(target.method, target.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (event) => {
      armWatchdog();
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          opts.onProgress?.(1);
          resolve();
          return;
        }
        reject(storageUploadError(xhr.status, xhr.responseText, xhr.getResponseHeader('Retry-After')));
      });
    xhr.onerror = () =>
      settle(() =>
        reject(browserOffline() ? new NetworkError(new Error('Storage upload failed')) : storageUnreachable()),
      );
    xhr.onabort = () =>
      settle(() => reject(stalled ? storageUnreachable() : new DOMException('Upload aborted', 'AbortError')));
    signal?.addEventListener('abort', onCancel);
    armWatchdog();
    xhr.send(form);
  });
}

/**
 * QA D1: si el almacén cortó la subida, se pregunta a la API (`/health`): si
 * tampoco responde, el problema es la conexión de la clínica (`NetworkError`);
 * si responde, es el almacén (el 503 tal cual).
 */
export async function storageOrNetwork(err: unknown): Promise<unknown> {
  if (!(err instanceof ApiError && err.code === STORAGE_UNREACHABLE_CODE)) return err;
  try {
    await apiFetch<unknown>('/health');
    return err;
  } catch (probe) {
    return probe instanceof NetworkError ? probe : err;
  }
}

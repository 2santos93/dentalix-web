import { ApiError, NetworkError } from './api-error';
import { apiErrorFromBody } from './client';

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
 * campos). Un rechazo es un `ApiError` con el mensaje en español; un fallo de
 * red (o CORS), `NetworkError`.
 */
export function uploadToStorage(
  target: StorageUploadTarget,
  file: Blob,
  opts: StorageUploadOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
        return;
      }
      reject(storageUploadError(xhr.status, xhr.responseText, xhr.getResponseHeader('Retry-After')));
    };
    xhr.onerror = () => reject(new NetworkError(new Error('Storage upload failed')));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.send(form);
  });
}

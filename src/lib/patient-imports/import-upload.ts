import { setActiveLocationId } from '@/lib/locations/location-store';
import {
  apiErrorFromBody,
  buildRequestHeaders,
  isStaleLocationError,
  NetworkError,
  refreshAccessToken,
} from '@/lib/api/client';
import { IMPORT_UPLOAD_ROUTES, type ImportUploadStep } from './import-upload-routes';

export interface ImportUploadOptions {
  token?: string;
  /** Fracción enviada (0..1). Termina en 1 cuando la API responde bien. */
  onProgress?: (fraction: number) => void;
}

interface RawResponse {
  status: number;
  text: string;
  retryAfter: string | null;
  /** La sede que viajó en `X-Location-Id` (null si ninguna). */
  sentLocationId: string | null;
}

/**
 * Un POST multipart por XHR (`fetch` no informa del progreso de la SUBIDA) a
 * la ruta de subida de la web, con las mismas cabeceras que `doFetch`.
 */
function send(step: ImportUploadStep, form: FormData, opts: ImportUploadOptions, token?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', IMPORT_UPLOAD_ROUTES[step].web);
    const { headers, sentLocationId } = buildRequestHeaders({ token, json: false });
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        text: xhr.responseText,
        retryAfter: xhr.getResponseHeader('Retry-After'),
        sentLocationId,
      });
    xhr.onerror = () => reject(new NetworkError(new Error('Import upload failed')));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.send(form);
  });
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Sube el archivo de la importación (DX-107) con progreso, por la ruta de
 * subida de la web (`IMPORT_UPLOAD_ROUTES`) y no por el proxy `/api/v1`, que
 * desde DX-259 corta en 1 MB. Se comporta como `apiFetch`: con un 401 renueva
 * el access token UNA vez y repite la subida; una sede huérfana (400 «unknown
 * location») se suelta y la subida se repite UNA vez sin la cabecera;
 * cualquier otro error es un `ApiError` (lo enseña `apiErrorMessage()`) y un
 * fallo de red, `NetworkError`.
 */
export async function uploadImportFile<T>(
  step: ImportUploadStep,
  form: FormData,
  opts: ImportUploadOptions = {},
): Promise<T> {
  let token = opts.token;
  let res = await send(step, form, opts, token);
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      opts.onProgress?.(0);
      res = await send(step, form, opts, token);
    }
  }
  let body = parseJson(res.text);
  if (res.status < 200 || res.status >= 300) {
    const error = apiErrorFromBody(res.status, body, res.retryAfter);
    if (!isStaleLocationError(error, res.sentLocationId, token)) throw error;
    setActiveLocationId(null);
    opts.onProgress?.(0);
    res = await send(step, form, opts, token);
    body = parseJson(res.text);
    if (res.status < 200 || res.status >= 300) {
      throw apiErrorFromBody(res.status, body, res.retryAfter);
    }
  }
  opts.onProgress?.(1);
  return body as T;
}

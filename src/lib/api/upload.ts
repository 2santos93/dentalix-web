import { apiBaseUrl } from './api-base';
import { apiErrorFromBody, buildRequestHeaders, NetworkError, refreshAccessToken } from './client';

export interface UploadOptions {
  token?: string;
  /** Fracción enviada (0..1). Termina en 1 cuando la API responde bien. */
  onProgress?: (fraction: number) => void;
}

interface RawResponse {
  status: number;
  text: string;
  retryAfter: string | null;
}

/**
 * Una petición multipart por XHR: `fetch` no informa del progreso de la
 * SUBIDA y XHR sí (`upload.onprogress`). Mismas cabeceras que `doFetch`.
 */
function send(path: string, formData: FormData, opts: UploadOptions, token?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl()}${path}`);
    const { headers } = buildRequestHeaders({ token, json: false });
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
      });
    xhr.onerror = () => reject(new NetworkError(new Error('XHR upload failed')));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.send(formData);
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
 * Sube un `FormData` con progreso (DX-151). Se comporta como `apiFetch`: con un
 * 401 renueva el access token UNA vez y repite la subida; cualquier otro error
 * es un `ApiError` con `messages`/`code` (lo enseña `apiErrorMessage()`), y un
 * fallo de red, `NetworkError`.
 */
export async function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  opts: UploadOptions = {},
): Promise<T> {
  let res = await send(path, formData, opts, opts.token);
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      opts.onProgress?.(0);
      res = await send(path, formData, opts, newToken);
    }
  }
  const body = parseJson(res.text);
  if (res.status < 200 || res.status >= 300) {
    throw apiErrorFromBody(res.status, body, res.retryAfter);
  }
  opts.onProgress?.(1);
  return body as T;
}

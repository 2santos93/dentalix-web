import { useAuthStore } from '@/lib/auth/auth-store';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';
import { apiBaseUrl } from './api-base';
import { ApiError, NetworkError } from './api-error';
import { parseRetryAfter } from './error-message';

export { ApiError, NetworkError };

const REFRESH_PATH = '/auth/refresh';

// Mensaje EXACTO con el que el backend rechaza una sede que no es del tenant
// (`tenant-context.interceptor.ts`). Se compara sin distinguir mayúsculas y por
// inclusión para sobrevivir a un retoque de redacción, pero sigue siendo un
// acoplamiento a la respuesta del backend: si allí cambia el texto, aquí deja de
// autocurarse (los tests de `client.test.ts` lo fijan por si acaso).
const UNKNOWN_LOCATION = 'unknown location';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
  // Per-call extra headers (e.g. Idempotency-Key on POST payments). Merged on
  // top of the built-in Content-Type/Authorization/X-Tenant-Host headers.
  headers?: Record<string, string>;
}

// A single in-flight refresh shared by every request that hits a 401 at the
// same time. Access tokens are short-lived (JWT_ACCESS_TTL, ~15m), so when
// one expires it's common for several concurrent requests to 401 together —
// without this, each would POST /auth/refresh and, because the backend
// ROTATES the refresh token on every call, the second refresh would race the
// first. Funnelling them through one promise rotates exactly once.
let refreshInFlight: Promise<string | null> | null = null;

// Nombre del Web Lock que serializa el refresh ENTRE pestañas del mismo host.
const REFRESH_LOCK = 'dentalix-refresh';
// Sin Web Locks, otra pestaña puede gastar la misma cookie a la vez: la que
// pierde espera esto (a que la ganadora reciba la cookie nueva) y reintenta.
const NO_LOCKS_SETTLE_MS = 300;

// Estado de sesión de antes de DX-062: el par entero en localStorage.
const LEGACY_STORAGE_KEY = 'dentalix-auth';

/**
 * Refresh token del estado antiguo (`localStorage['dentalix-auth']`), si lo
 * hay. Un estado sin refresh o corrupto se borra directamente.
 */
function legacyRefreshToken(): string | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const token = (JSON.parse(raw) as { state?: { refreshToken?: unknown } }).state?.refreshToken;
    if (typeof token === 'string' && token) return token;
  } catch {
    /* corrupto: se borra abajo */
  }
  forgetLegacyState();
  return null;
}

function forgetLegacyState(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* sin almacenamiento: nada que borrar */
  }
}

function webLocks(): LockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

/** `true` si el error es un 401 de la API (refresh muerto), no red ni 5xx. */
function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * Un `POST /auth/refresh`. Sin argumento, el refresh viaja en la cookie
 * HttpOnly; con `legacyToken`, en el body (migración: la API lo pasa a la
 * cookie). Resuelve al access token nuevo.
 */
async function postRefresh(legacyToken?: string): Promise<string> {
  // `allowRefresh: false` — never recurse: a 401 from the refresh call
  // itself means the refresh token is dead, not that we should refresh.
  const res = await doFetch(
    REFRESH_PATH,
    { method: 'POST', body: legacyToken ? { refreshToken: legacyToken } : undefined },
    false,
  );
  const { accessToken } = (await res.json()) as { accessToken: string };
  useAuthStore.getState().setAccessToken(accessToken);
  return accessToken;
}

/**
 * El refresh, ya dentro del lock entre pestañas. El refresh token es de UN SOLO
 * USO y la cookie la comparten todas las pestañas del host: con el lock, cada
 * pestaña rota a su turno con la cookie que dejó la anterior.
 *
 * Migración (sesiones de antes de DX-062): si queda el par antiguo en
 * localStorage, su refresh se usa UNA vez para obtener la cookie y se borra
 * (también si ya no vale). Solo un error de red/5xx lo conserva para otro
 * intento. Dentro del lock, otra pestaña ya no lo encuentra.
 */
async function refreshUnderLock(hasLocks: boolean): Promise<string | null> {
  const legacy = legacyRefreshToken();
  if (legacy) {
    try {
      const token = await postRefresh(legacy);
      forgetLegacyState();
      return token;
    } catch (err) {
      if (!isUnauthorized(err)) return null;
      forgetLegacyState();
    }
  }
  try {
    return await postRefresh();
  } catch (err) {
    // Network error or 5xx: the session is not known to be dead, so keep it
    // (the current request fails; a later one will retry the refresh).
    if (!isUnauthorized(err)) return null;
    if (!hasLocks) {
      // Sin lock, otra pestaña pudo gastar la misma cookie a la vez: se le da
      // tiempo a recibir la nueva y se reintenta una vez.
      await new Promise((resolve) => setTimeout(resolve, NO_LOCKS_SETTLE_MS));
      try {
        return await postRefresh();
      } catch (retryErr) {
        if (!isUnauthorized(retryErr)) return null;
      }
    }
    useAuthStore.getState().clear();
    return null;
  }
}

/**
 * Renueva el access token con el refresh de la cookie (`POST /auth/refresh`),
 * lo guarda en memoria y lo devuelve. `null` si no se pudo; solo un 401 (sin
 * sesión o sesión muerta) la cierra. En el servidor (sin `window`) no hay
 * cookie de sesión que usar: siempre `null`.
 */
function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (typeof window === 'undefined') return null;
    const locks = webLocks();
    if (!locks) return refreshUnderLock(false);
    return locks.request(REFRESH_LOCK, () => refreshUnderLock(true));
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Ejecuta `fn` bajo el MISMO lock entre pestañas que el refresh. Lo usa el
 * logout: si otra pestaña está rotando la cookie, el logout espera y revoca la
 * cookie ya rotada; si no, la respuesta del refresh llegaría después de la del
 * logout y dejaría viva una cookie nueva. Sin Web Locks, ejecuta `fn` sin más.
 */
export function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof window === 'undefined' ? null : webLocks();
  return locks ? (locks.request(REFRESH_LOCK, fn) as Promise<T>) : fn();
}

let bootstrapInFlight: Promise<void> | null = null;

/**
 * Arranque de sesión al cargar la página (DX-062): el access token no se
 * persiste, así que se pide uno nuevo con la cookie. Termina con la sesión
 * resuelta (`_hasHydrated`), con o sin access token. Si ya está resuelta (p. ej.
 * tras el login en esta misma carga) no hace nada.
 */
export function bootstrapSession(): Promise<void> {
  if (useAuthStore.getState()._hasHydrated) return Promise.resolve();
  bootstrapInFlight ??= refreshAccessToken()
    .then(() => useAuthStore.getState().markResolved())
    .finally(() => {
      bootstrapInFlight = null;
    });
  return bootstrapInFlight;
}

/**
 * `fetch` que relanza su rechazo como `NetworkError` (revisión D-2), salvo
 * `AbortError`/`TimeoutError`, que son de quien llama (cancelación o límite de
 * tiempo) y pasan tal cual.
 */
async function fetchOrNetworkError(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const name = err instanceof Error || err instanceof DOMException ? err.name : null;
    if (name === 'AbortError' || name === 'TimeoutError') throw err;
    throw new NetworkError(err);
  }
}

async function doFetch(
  path: string,
  opts: ApiOptions,
  allowRefresh = true,
  allowLocationReset = true,
): Promise<Response> {
  // A FormData body (e.g. avatar upload) must NOT be JSON-serialized and must
  // NOT carry a `Content-Type: application/json` header — the browser sets
  // the correct `multipart/form-data; boundary=...` header itself when the
  // fetch `body` is a FormData instance.
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  // The backend resolves the tenant from the request host (see
  // `select-host.ts`: `x-tenant-host` → `x-forwarded-host` → `Host`, in that
  // order, outside prod). In the browser, `window.location.host` IS the
  // tenant's host (e.g. `agendademo7z.localhost:3001`), so send it — this
  // makes the tenant travel automatically without any caller having to know
  // or pass it. Server-side callers (no `window`) don't set this header; the
  // backend then falls back to `x-forwarded-host`/`Host` from the proxied
  // request, which is fine — there is no browser host to read here.
  if (typeof window !== 'undefined') {
    headers['X-Tenant-Host'] = window.location.host;
    // Modo cookie (DX-062): los endpoints que abren o renuevan sesión dejan el
    // refresh en la cookie HttpOnly y solo devuelven el access token.
    headers['X-Refresh-Transport'] = 'cookie';
  }
  // Sede activa: igual que el tenant, viaja sola en cada request en vez de
  // tener que pasarla por parámetro a cada llamada. Si no hay ninguna elegida
  // no se manda la cabecera, y el backend responde la vista CONSOLIDADA de la
  // clínica — que es el comportamiento de siempre.
  const sentLocationId = getActiveLocationId();
  if (sentLocationId) headers['X-Location-Id'] = sentLocationId;
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetchOrNetworkError(`${apiBaseUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body:
      opts.body === undefined
        ? undefined
        : isForm
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
    cache: 'no-store',
    // Mismo origen (`/api/v1` del host de la clínica): así viaja la cookie de
    // sesión, que la API acota a `/api/v1/auth`.
    credentials: 'same-origin',
  });
  // Expired access token → transparently refresh once and replay the request
  // with the new token. Skipped for the auth endpoints themselves (a 401 from
  // /login is "wrong password", not "expired session") and when a prior call
  // in this chain already refreshed (`allowRefresh: false`) so we retry at
  // most once. Tampoco en los públicos (`/public/*`, sin sesión): el 401 de
  // aceptar una invitación es «contraseña incorrecta» (DX-029).
  if (
    res.status === 401 &&
    allowRefresh &&
    !path.startsWith('/auth/') &&
    !path.startsWith('/public/')
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return doFetch(path, { ...opts, token: newToken }, false);
    }
  }
  if (!res.ok) {
    // El cuerpo de error de la API es `{ statusCode, message, error }`, con
    // `message` texto o el array de class-validator. Se guarda tal cual en
    // `messages`; qué se enseña lo decide `apiErrorMessage()`. Sin cuerpo JSON
    // (proxy caído, HTML), `message` queda en `HTTP <status>`, solo para logs.
    let messages: string[] = [];
    try {
      const data = (await res.json()) as { message?: unknown };
      const raw = data?.message;
      if (typeof raw === 'string' && raw) messages = [raw];
      else if (Array.isArray(raw)) messages = raw.filter((m): m is string => typeof m === 'string');
    } catch {
      /* sin cuerpo JSON */
    }
    const message = messages.length > 0 ? messages.join('; ') : `HTTP ${res.status}`;
    // Sede huérfana → autocuración. La sede elegida vive en localStorage y
    // sobrevive a la sede real: si se borra, se desactiva, o se reseedea la base
    // y cambian los ids, ese id se sigue mandando en CADA petición y el backend
    // las rechaza TODAS con este 400. Sin esto la app queda inservible hasta que
    // alguien limpia localStorage a mano, sin nada en pantalla que lo explique.
    //
    // `LocationSwitcher` ya reconcilia contra la lista real, pero solo mientras
    // está montado; aquí pasan todas las peticiones, así que cubre también las
    // pantallas que piden datos sin él. Se suelta la sede y se reintenta UNA
    // vez (`allowLocationReset: false`), ya sin la cabecera: eso devuelve la
    // vista consolidada, que es el comportamiento por defecto y siempre vale.
    if (
      res.status === 400 &&
      allowLocationReset &&
      sentLocationId &&
      message.toLowerCase().includes(UNKNOWN_LOCATION)
    ) {
      setActiveLocationId(null);
      return doFetch(path, opts, allowRefresh, false);
    }
    throw new ApiError(res.status, message, {
      messages,
      retryAfterSeconds: parseRetryAfter(res.headers?.get('Retry-After') ?? null),
    });
  }
  return res;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await doFetch(path, opts);
  return (await res.json()) as T;
}

/**
 * Same as `apiFetch`, but tolerates a `200` response with an EMPTY body
 * (content-length 0) by returning `null` instead of throwing — `res.json()`
 * throws on an empty string, which is exactly what
 * `GET /patients/:id/medical-history` returns when the patient has no
 * anamnesis yet (a normal state, not an error; see `MedicalHistoryController`
 * on the backend, which deliberately never 404s for "no history"). Do NOT
 * use `apiFetch` for that endpoint.
 */
export async function apiFetchOrNull<T>(path: string, opts: ApiOptions = {}): Promise<T | null> {
  const res = await doFetch(path, opts);
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

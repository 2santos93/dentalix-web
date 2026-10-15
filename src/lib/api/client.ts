import { useAuthStore } from '@/lib/auth/auth-store';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const REFRESH_PATH = '/auth/refresh';

// Mensaje EXACTO con el que el backend rechaza una sede que no es del tenant
// (`tenant-context.interceptor.ts`). Se compara sin distinguir mayúsculas y por
// inclusión para sobrevivir a un retoque de redacción, pero sigue siendo un
// acoplamiento a la respuesta del backend: si allí cambia el texto, aquí deja de
// autocurarse (los tests de `client.test.ts` lo fijan por si acaso).
const UNKNOWN_LOCATION = 'unknown location';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
// first and could run against an already-rotated token. Funnelling them
// through one promise rotates exactly once.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Refresh tokens are SINGLE-USE on the backend: reusing one that was already
 * rotated is a 401. The in-flight promise above only coalesces refreshes
 * inside ONE tab; other tabs share the pair only through the persisted store
 * (localStorage). So before spending — and after losing — a refresh, re-read
 * the persisted pair: if another tab already rotated, adopt its fresh access
 * token instead of reusing the stale refresh token (which would 401 and log
 * every tab out). Resolves to the adopted access token, or `null` when the
 * persisted pair is the same one this tab already had.
 */
async function adoptPairFromOtherTab(staleRefreshToken: string): Promise<string | null> {
  await useAuthStore.persist.rehydrate();
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (accessToken && refreshToken && refreshToken !== staleRefreshToken) {
    return accessToken;
  }
  return null;
}

/**
 * Exchanges the stored refresh token for a fresh access+refresh pair via
 * `POST /auth/refresh`, updates the auth store, and resolves to the new
 * access token. Resolves to `null` (and clears the store, forcing re-login)
 * when there is no refresh token or the refresh itself fails. Server-side
 * (no `window`) there is no persisted store, so it's always `null`.
 */
function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (typeof window === 'undefined') return null;
    const { refreshToken, setTokens, clear } = useAuthStore.getState();
    if (!refreshToken) return null;
    const rotatedElsewhere = await adoptPairFromOtherTab(refreshToken);
    if (rotatedElsewhere) return rotatedElsewhere;
    try {
      // `allowRefresh: false` — never recurse: a 401 from the refresh call
      // itself means the refresh token is dead, not that we should refresh.
      const res = await doFetch(
        REFRESH_PATH,
        { method: 'POST', body: { refreshToken } },
        false,
      );
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setTokens(data);
      return data.accessToken;
    } catch {
      // Lost the race to another tab that spent the same refresh token a
      // moment earlier: its pair is already persisted, so keep the session.
      const winner = await adoptPairFromOtherTab(refreshToken);
      if (winner) return winner;
      clear();
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
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
  if (typeof window !== 'undefined') headers['X-Tenant-Host'] = window.location.host;
  // Sede activa: igual que el tenant, viaja sola en cada request en vez de
  // tener que pasarla por parámetro a cada llamada. Si no hay ninguna elegida
  // no se manda la cabecera, y el backend responde la vista CONSOLIDADA de la
  // clínica — que es el comportamiento de siempre.
  const sentLocationId = getActiveLocationId();
  if (sentLocationId) headers['X-Location-Id'] = sentLocationId;
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body:
      opts.body === undefined
        ? undefined
        : isForm
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
    cache: 'no-store',
  });
  // Expired access token → transparently refresh once and replay the request
  // with the new token. Skipped for the auth endpoints themselves (a 401 from
  // /login is "wrong password", not "expired session") and when a prior call
  // in this chain already refreshed (`allowRefresh: false`) so we retry at
  // most once.
  if (
    res.status === 401 &&
    allowRefresh &&
    !path.startsWith('/auth/')
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return doFetch(path, { ...opts, token: newToken }, false);
    }
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* keep default */
    }
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
    throw new ApiError(res.status, message);
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

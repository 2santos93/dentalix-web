import { useAuthStore } from '@/lib/auth/auth-store';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const REFRESH_PATH = '/auth/refresh';

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

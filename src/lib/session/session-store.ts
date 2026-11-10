'use client';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { readJwtClaims } from '@/lib/auth/jwt-claims';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { onLocationChange } from '@/lib/locations/location-store';
import { getMe, type MyProfile } from '@/lib/me/me-api';
import { registerTestReset } from './test-resets';

/**
 * Datos de la sesión que comparte toda la app (FE-031, DX-117): el perfil
 * (`GET /me`) y las sedes (`GET /locations`). Antes cada vista los pedía por su
 * cuenta —el shell monta el menú de cuenta y el selector de sede dos veces
 * (escritorio y teléfono) y otra media docena de pantallas leía las sedes—:
 * cada carga y cada renovación del access token pedía `/me` y `/locations`
 * varias veces.
 *
 * Reglas:
 * - SOLO en memoria: nada en localStorage ni en sessionStorage.
 * - La caché es de la SESIÓN (usuario + clínica + rol + sedes permitidas, los
 *   claims del token), no del access token: renovarlo cada ~15 min no vuelve a
 *   pedir nada. Si cambian los claims (otra clínica, otra membresía, sedes
 *   acotadas de otra forma) es otra sesión y se relee.
 * - Una petición en vuelo se comparte: dos montajes a la vez, una lectura.
 * - Un fallo no se cachea: el siguiente intento (Reintentar) vuelve a la API.
 * - Las sedes se invalidan al cambiar de sede (esta pestaña u otra), al crear,
 *   editar o desactivar una en Ajustes → Sedes (`invalidateLocations()`), al
 *   cerrar sesión (aquí o en otra pestaña: el token pasa a `null`) y al cambiar
 *   de sesión.
 *
 * Es el ÚNICO módulo que llama a `listLocations` y a `getMe` (guarda en
 * `src/architecture/session-store-guard.test.ts`). La API sigue siendo la
 * autoridad: esto solo evita preguntarle lo mismo dos veces.
 */

interface Snapshot<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Invalidado: el dato (si hay) vale para pintar, pero se relee. */
  stale: boolean;
  /** Sube solo al invalidar: ni al llegar un dato ni al cambiar de sesión. */
  generation: number;
}

const IDLE: Snapshot<never> = Object.freeze({
  data: undefined,
  error: undefined,
  loading: false,
  stale: false,
  generation: 0,
});

/** Clave de sesión de un access token: sus claims, no el token. */
export function sessionKeyOf(token: string | null | undefined): string | null {
  if (!token) return null;
  const claims = readJwtClaims(token);
  if (!claims || typeof claims.sub !== 'string') return token; // Token no legible (tests): él mismo.
  const loc = Array.isArray(claims.loc) ? [...claims.loc].map(String).sort().join(',') : '*';
  return [claims.sub, String(claims.tenantId ?? ''), String(claims.role ?? ''), loc].join('|');
}

let sessionKey: string | null = null;

class SessionResource<T> {
  snap: Snapshot<T> = IDLE;
  private promise: Promise<T> | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly fetcher: (token: string) => Promise<T>) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** El estado para `token`, o vacío si `token` es de otra sesión. */
  snapshotFor(token: string | null): Snapshot<T> {
    const key = sessionKeyOf(token);
    return key !== null && key === sessionKey ? this.snap : IDLE;
  }

  private set(next: Snapshot<T>) {
    this.snap = next;
    for (const listener of this.listeners) listener();
  }

  /** El dato vigente, la lectura en vuelo, o una lectura nueva. */
  load(token: string): Promise<T> {
    // Un token que no es el de la sesión de la pestaña (vista suelta con otro
    // token): se responde sin tocar la caché, para no vaciársela a los demás.
    if (!adoptSession(token)) return this.fetcher(token);
    const current = this.snap;
    if (current.data !== undefined && !current.stale) return Promise.resolve(current.data);
    if (this.promise) return this.promise;
    // Una respuesta vacía cuenta como fallo: «sin dato» es el estado que dispara
    // la lectura, y guardarla así volvería a pedirla sin fin.
    const request: Promise<T> = Promise.resolve(this.fetcher(token))
      .then((data) => {
        if (data === undefined) throw new Error('Respuesta vacía de la API');
        return data;
      })
      .then(
        (data) => {
          if (this.promise === request) {
            this.promise = null;
            this.set({
              ...this.snap,
              data,
              error: undefined,
              loading: false,
              stale: false,
            });
          }
          return data;
        },
        (error: unknown) => {
          if (this.promise === request) {
            this.promise = null;
            this.set({ ...this.snap, error, loading: false });
          }
          throw error;
        },
      );
    this.promise = request;
    this.set({ ...current, error: undefined, loading: true });
    return request;
  }

  /** Sustituye el dato (p. ej. el perfil que devuelve un PATCH): no relee. */
  put(token: string, data: T) {
    if (!adoptSession(token)) return;
    this.promise = null;
    this.set({
      ...this.snap,
      data,
      error: undefined,
      loading: false,
      stale: false,
    });
  }

  invalidate() {
    if (this.snap === IDLE && !this.promise) return;
    this.promise = null;
    this.set({
      ...this.snap,
      error: undefined,
      loading: false,
      stale: true,
      generation: this.snap.generation + 1,
    });
  }

  reset() {
    if (this.snap === IDLE && !this.promise) return;
    this.promise = null;
    // Sin subir `generation`: quien lee con un token ya relee al cambiarle el
    // token; si subiera, dos vistas con tokens de sesiones distintas (tests)
    // se vaciarían la caché la una a la otra sin fin.
    this.set({ ...IDLE, generation: this.snap.generation });
  }

  /** Solo para jest: vacía sin avisar (los componentes del test aún montados no se repintan). */
  forget() {
    this.promise = null;
    this.snap = IDLE;
  }

  isEmpty(): boolean {
    return this.snap.data === undefined && !this.promise;
  }
}

const meResource = new SessionResource<MyProfile>(getMe);
const locationsResource = new SessionResource<ClinicLocation[]>(listLocations);

/** El token de la pestaña (store de auth), o `null` si no hay o no se puede leer. */
function currentAuthToken(): string | null {
  const getState = (useAuthStore as { getState?: () => { accessToken?: string | null } }).getState;
  return typeof getState === 'function' ? (getState().accessToken ?? null) : null;
}

/**
 * La caché pasa a la sesión de `token` (vaciándola si era otra) y devuelve
 * `true`; `false` si `token` no es de la sesión de la pestaña: entonces no se
 * cachea, porque dos sesiones alternándose se vaciarían la caché sin fin.
 */
function adoptSession(token: string): boolean {
  ensureLocationChangeListener();
  const key = sessionKeyOf(token);
  const authToken = currentAuthToken();
  if (authToken !== null && sessionKeyOf(authToken) !== key) return false;
  if (key === sessionKey) return true;
  sessionKey = key;
  meResource.reset();
  locationsResource.reset();
  return true;
}

let unlistenLocationChange: (() => void) | null = null;
/** Cambiar de sede (aquí o en otra pestaña, o porque la API la soltó) relee las sedes. */
function ensureLocationChangeListener() {
  if (unlistenLocationChange || typeof window === 'undefined') return;
  unlistenLocationChange = onLocationChange(() => locationsResource.invalidate());
}

/** Olvida todo: cierre de sesión (esta pestaña u otra) o sesión caducada. */
export function clearSessionStore(): void {
  sessionKey = null;
  meResource.reset();
  locationsResource.reset();
}

registerTestReset(() => {
  sessionKey = null;
  meResource.forget();
  locationsResource.forget();
  unlistenLocationChange?.();
  unlistenLocationChange = null;
});

/** Sedes de la sesión (`GET /locations`), compartidas y sin repetir petición. */
export function loadLocations(token: string): Promise<ClinicLocation[]> {
  return locationsResource.load(token);
}

/** Tras crear, editar o desactivar una sede: todos los consumidores releen. */
export function invalidateLocations(): void {
  locationsResource.invalidate();
}

/** Perfil del usuario de la sesión (`GET /me`), compartido. */
export function loadMe(token: string): Promise<MyProfile> {
  return meResource.load(token);
}

/** El perfil ya actualizado (respuesta de `PATCH /me`): el menú de cuenta lo pinta sin releer. */
export function putMe(token: string, profile: MyProfile): void {
  meResource.put(token, profile);
}

/** Tras cambiar el avatar: el perfil se relee. */
export function invalidateMe(): void {
  meResource.invalidate();
}

/**
 * Estado de un dato de la sesión para pintarlo según la escalera de errores
 * (`src/components/errors`): cada pantalla elige su escalón con `error` y
 * ofrece `retry`, que vuelve a la API.
 */
export type SessionResourceState<T> =
  | { status: 'loading'; data: undefined; retry: () => void }
  | { status: 'error'; data: undefined; error: unknown; retry: () => void }
  | { status: 'ready'; data: T; retry: () => void };

const noop = () => {};

function useSessionResource<T>(resource: SessionResource<T>): SessionResourceState<T> {
  const token = useAuthStore((s) => s.accessToken);
  const snap = useSyncExternalStore(
    resource.subscribe,
    () => resource.snapshotFor(token),
    () => IDLE as Snapshot<T>,
  );

  useEffect(() => {
    if (!token) {
      // Sin sesión (logout aquí, en otra pestaña o sesión caducada): nada que
      // conservar. Solo si queda algo, para no despertar a los suscriptores.
      if (sessionKey !== null || !meResource.isEmpty() || !locationsResource.isEmpty()) clearSessionStore();
      return;
    }
    // Se lee si no hay nada (ni dato ni error) o si se invalidó; un error se
    // queda hasta que alguien pulse Reintentar, sin bucles contra la API.
    const idle = snap.data === undefined && snap.error === undefined && !snap.loading;
    if (idle || (snap.stale && !snap.loading)) resource.load(token).catch(noop);
  }, [resource, token, snap]);

  const retry = useCallback(() => {
    if (!token) return;
    resource.invalidate();
    resource.load(token).catch(noop);
  }, [resource, token]);

  return useMemo<SessionResourceState<T>>(() => {
    if (snap.data !== undefined) return { status: 'ready', data: snap.data, retry };
    if (snap.error !== undefined) return { status: 'error', data: undefined, error: snap.error, retry };
    return { status: 'loading', data: undefined, retry };
  }, [snap, retry]);
}

/** El perfil de la sesión (`GET /me`) para el token del store de auth. */
export function useMe(): SessionResourceState<MyProfile> {
  return useSessionResource(meResource);
}

/** Las sedes de la sesión (`GET /locations`) para el token del store de auth. */
export function useLocations(): SessionResourceState<ClinicLocation[]> {
  return useSessionResource(locationsResource);
}

/**
 * Lector de sedes para las vistas que reciben el token por props: llamarlo
 * devuelve la lista de la caché de la sesión. Cambia de identidad al
 * invalidarse, así que los efectos que dependen de él vuelven a leer.
 */
export type SessionLocationsLoader = (() => Promise<ClinicLocation[]>) & {
  invalidate: () => void;
};

export function useSessionLocations(token: string | null): SessionLocationsLoader {
  const generation = useSyncExternalStore(
    locationsResource.subscribe,
    () => locationsResource.snap.generation,
    () => 0,
  );
  return useMemo(() => {
    const load = () => (token ? loadLocations(token) : Promise.resolve<ClinicLocation[]>([]));
    return Object.assign(load, { invalidate: invalidateLocations });
    // `generation` no se lee: solo estrena lector al invalidar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, generation]);
}

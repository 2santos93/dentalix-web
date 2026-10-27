'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getActiveLocationId, onLocationChange } from '@/lib/locations/location-store';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { IN_CLINIC_POLL_MS, getInClinic, onInClinicChanged, type InClinicView } from '@/lib/appointments/patient-flow';
import { notifyError } from '@/components/errors/notify';
import { ApiError } from '@/lib/api/api-error';
import { LOCATION_LOCALE_REQUIRED } from '@/lib/locations/use-sede-format';

export const IN_CLINIC_LOAD_ERROR = 'No pudimos cargar quién está en la clínica.';
export const IN_CLINIC_REFRESH_ERROR = 'No pudimos actualizar el panel «En clínica».';
export const IN_CLINIC_STALE_MS = 15_000;
export interface InClinicState {
  view: InClinicView | null;
  loading: boolean;
  error: string | null;
  /**
   * G1-B §10: la primera carga respondió 409 `LOCATION_LOCALE_REQUIRED` (la
   * sede no tiene formato o reloj): el panel muestra `SedeConfigError` con
   * `error` (el texto de la API) y esta sede, no un fallo de carga.
   */
  localeMissing: { locationId: string } | null;
  noLocation: boolean;
  reload: () => void;
}
interface UseInClinicOptions {
  reloadKey?: number;
  enabled?: boolean;
  silent?: boolean;
  followChanges?: boolean;
}
const InClinicContext = createContext<InClinicState | null>(null);

/** El shell posee la única fuente; la clave de sesión desmonta datos y timers. */
export function InClinicProvider({ token, enabled = true, children }: { token: string | null; enabled?: boolean; children: ReactNode }) {
  return <InClinicSession token={token} enabled={enabled}>{children}</InClinicSession>;
}
function InClinicSession({ token, enabled, children }: { token: string | null; enabled: boolean; children: ReactNode }) {
  const state = useInClinicSource(token, { enabled, followChanges: true });
  return <InClinicContext.Provider value={state}>{children}</InClinicContext.Provider>;
}

/** Consumidores del shell solo se suscriben; fallback para superficies aisladas. */
export function useInClinic(token: string | null, options: UseInClinicOptions = {}): InClinicState {
  const shared = useContext(InClinicContext);
  const isolated = useInClinicSource(token, { ...options, enabled: shared === null && options.enabled !== false });
  return shared ?? isolated;
}

function useInClinicSource(token: string | null, { reloadKey = 0, enabled = true, silent = false, followChanges = false }: UseInClinicOptions): InClinicState {
  const [activeLocationId, setActiveLocationId] = useState(getActiveLocationId);
  const key = `${token ?? ''}:${activeLocationId ?? ''}`;
  const [result, setResult] = useState<{
    key: string;
    view: InClinicView | null;
    error: string | null;
    localeMissing?: InClinicState['localeMissing'];
    noLocation: boolean;
  } | null>(null);
  const requestLocations = useSessionLocations(token);
  const refreshRef = useRef<() => void>(() => {});
  const reload = useCallback(() => refreshRef.current(), []);
  useEffect(() => onLocationChange(() => setActiveLocationId(getActiveLocationId())), []);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    let running = false;
    let queued = false;
    let shown = false;
    let lastLoadedAt = 0;
    // La sede se resuelve una vez para esta identidad, nunca en cada vuelta.
    let locationPromise: Promise<string | null> | null = null;
    const resolveLocation = () => locationPromise ??= activeLocationId
      ? Promise.resolve(activeLocationId)
      : requestLocations().then((locations) => {
          const active = locations.filter((location) => location.isActive);
          return active.length === 1 ? active[0].id : null;
        }).catch((error) => { locationPromise = null; throw error; });
    async function load(invalidate = false) {
      if (running) { if (invalidate) queued = true; return; }
      running = true;
      let location: string | null = null;
      try {
        location = await resolveLocation();
        if (cancelled) return;
        if (location === null) {
          setResult({ key, view: null, error: null, noLocation: true });
          lastLoadedAt = Date.now();
          return;
        }
        const view = await getInClinic(token!, location);
        if (cancelled) return;
        shown = true;
        lastLoadedAt = Date.now();
        setResult({ key, view, error: null, noLocation: false });
      } catch (error) {
        if (cancelled) return;
        if (shown) {
          if (!silent) notifyError(IN_CLINIC_REFRESH_ERROR, { onRetry: reload });
        } else {
          // La sede que nombra la API; si no la nombra, la que se pidió.
          const missing = error instanceof ApiError && error.code === LOCATION_LOCALE_REQUIRED
            ? error.locationId ?? location
            : null;
          setResult({
            key,
            view: null,
            error: apiErrorMessage(error, IN_CLINIC_LOAD_ERROR),
            localeMissing: missing ? { locationId: missing } : null,
            noLocation: false,
          });
        }
      } finally {
        running = false;
        if (!cancelled && queued) { queued = false; void load(); }
      }
    }
    refreshRef.current = () => { void load(true); };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, IN_CLINIC_POLL_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLoadedAt > IN_CLINIC_STALE_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = followChanges ? onInClinicChanged(() => { void load(true); }) : () => {};
    return () => {
      cancelled = true;
      setResult(null);
      refreshRef.current = () => {};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [token, enabled, key, activeLocationId, reloadKey, silent, followChanges, reload, requestLocations]);

  const current = token && enabled && result?.key === key ? result : null;
  return {
    view: current?.view ?? null,
    loading: Boolean(token && enabled && !current),
    error: current?.error ?? null,
    localeMissing: current?.localeMissing ?? null,
    noLocation: current?.noLocation ?? false,
    reload,
  };
}

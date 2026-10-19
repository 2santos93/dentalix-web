'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getActiveLocationId, onLocationChange } from '@/lib/locations/location-store';
import { listLocations } from '@/lib/locations/locations-api';
import { IN_CLINIC_POLL_MS, getInClinic, type InClinicView } from '@/lib/appointments/patient-flow';
import { notifyError } from '@/components/errors/notify';

export const IN_CLINIC_LOAD_ERROR = 'No pudimos cargar quién está en la clínica.';
export const IN_CLINIC_REFRESH_ERROR = 'No pudimos actualizar el panel «En clínica».';

export interface InClinicState {
  view: InClinicView | null;
  /** Primera carga (o reintento tras un error sin datos): el esqueleto. */
  loading: boolean;
  /** La carga falló y no hay nada que mostrar (escalón 1). */
  error: string | null;
  /** «Todas las sedes» en una clínica con varias: el panel es por sede. */
  noLocation: boolean;
  /** Vuelve a pedir el panel YA (el Reintentar y tras cambiar un estado). */
  reload: () => void;
}

interface UseInClinicOptions {
  /** Cambiarlo repite la carga (p. ej. tras cambiar un estado en la agenda). */
  reloadKey?: number;
  /** false: no pide nada (p. ej. el contador, que solo es del odontólogo). */
  enabled?: boolean;
  /** Sin avisos si falla un refresco en segundo plano (el contador de la cabecera). */
  silent?: boolean;
}

/** La sede del panel: la activa; sin ninguna, la única sede activa de la clínica. */
async function panelLocation(token: string, active: string | null): Promise<string | null> {
  if (active) return active;
  const locations = (await listLocations(token)).filter((l) => l.isActive);
  return locations.length === 1 ? locations[0].id : null;
}

/**
 * Panel «En clínica» (DX-200) de la sede activa (o de la única, en una clínica
 * de una sede, donde no se elige ninguna): una carga y luego un sondeo cada
 * 45 s mientras la pestaña está visible (sin WebSocket). Si un refresco falla
 * con datos en pantalla, los datos siguen (escalón 3: aviso con Reintentar);
 * si falla sin datos, el error es de la sección (escalón 1).
 */
export function useInClinic(
  token: string | null,
  { reloadKey = 0, enabled = true, silent = false }: UseInClinicOptions = {},
): InClinicState {
  const [activeLocationId, setActiveLocationId] = useState(getActiveLocationId);
  // Todo lo cargado va con la sede activa con la que se pidió: al cambiar de
  // sede, lo anterior no vale.
  const key = activeLocationId ?? '';
  const [loaded, setLoaded] = useState<{ key: string; view: InClinicView } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [unresolved, setUnresolved] = useState<string | null>(null);
  const [localReload, setLocalReload] = useState(0);
  // Sede de la que ya hay datos en pantalla: un fallo no los borra.
  const shownFor = useRef<string | null>(null);

  useEffect(() => onLocationChange(() => setActiveLocationId(getActiveLocationId())), []);

  const reload = useCallback(() => setLocalReload((k) => k + 1), []);

  useEffect(() => {
    if (!token || !enabled) return;
    const authToken = token;
    let cancelled = false;
    async function load() {
      const showing = shownFor.current === key;
      try {
        const location = await panelLocation(authToken, key || null);
        if (cancelled) return;
        if (location === null) {
          setUnresolved(key);
          return;
        }
        const data = await getInClinic(authToken, location);
        if (cancelled) return;
        shownFor.current = key;
        setLoaded({ key, view: data });
        setFailed(null);
        setUnresolved(null);
      } catch (err) {
        if (cancelled) return;
        if (showing) {
          if (!silent) notifyError(IN_CLINIC_REFRESH_ERROR, { onRetry: reload });
        } else {
          setFailed({ key, message: apiErrorMessage(err, IN_CLINIC_LOAD_ERROR) });
        }
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, IN_CLINIC_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, enabled, key, reloadKey, localReload, silent, reload]);

  const view = loaded && loaded.key === key ? loaded.view : null;
  const error = failed && failed.key === key ? failed.message : null;
  const noLocation = unresolved === key && view === null;
  return {
    view,
    // Sin datos, ni error, ni falta de sede: todavía cargando.
    loading: enabled && view === null && !noLocation && error === null,
    error,
    noLocation,
    reload,
  };
}

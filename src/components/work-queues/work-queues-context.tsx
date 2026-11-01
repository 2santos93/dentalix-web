'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getTokenRole } from '@/lib/auth/token-role';
import { getActiveLocationId, onLocationChange } from '@/lib/locations/location-store';
import {
  getWorkQueuesSummary,
  menuQueuesFor,
  type WorkQueueItem,
  type WorkQueueKey,
} from '@/lib/work-queues/work-queues-api';

/** Cada cuánto se relee mientras la app está abierta. */
const POLL_MS = 60_000;

/**
 * DX-503-bis: pantallas que montan «Mi día» (Inicio). En ellas la PRIMERA
 * lectura ya pide todas las listas: sin esto, el proveedor pedía las del menú
 * y, un instante después (al apuntarse Inicio), todas — dos peticiones.
 */
const FULL_PATHS: ReadonlySet<string> = new Set(['/dashboard']);

/** Evento de ventana tras cerrar o descartar un pendiente: se relee al momento. */
export const WORK_QUEUES_CHANGED_EVENT = 'dentalix:closing-queue-changed';

/** Lo que ve «Mi día» (el bloque «Pendientes» de Inicio). */
export type WorkQueuesView =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; items: WorkQueueItem[]; retry: () => void };

interface Ctx {
  count: (key: WorkQueueKey) => number;
  view: WorkQueuesView;
  /** Inicio se apunta mientras está montado: el sondeo pasa a pedir todas las listas. */
  subscribeFull: () => () => void;
}

const WorkQueuesContext = createContext<Ctx | null>(null);

interface Snapshot {
  /** Sede de la lectura (`all` = sin cabecera): otra sede no vale. */
  scope: string;
  /** La lectura pidió todas las listas del rol (no solo las del menú). */
  full: boolean;
  items: WorkQueueItem[];
}

/**
 * DX-503: UNA lectura de `GET /work-queues/summary` para toda la app. El menú
 * (contadores de «Pendiente de cerrar» y «Anamnesis») y «Mi día» en Inicio
 * leen la MISMA respuesta, así que sus números nunca difieren. Fuera de
 * Inicio se piden solo las listas del menú; en Inicio (o con «Mi día»
 * montado), todas, desde la primera lectura. Se
 * relee al cambiar de pantalla o de sede, cada minuto y al recibir
 * `WORK_QUEUES_CHANGED_EVENT`.
 *
 * Contadores del menú: un fallo deja el último valor (es un contador; cada
 * lista tiene su propio estado de error en su pantalla). «Mi día»: un fallo
 * de toda la lectura es un error con Reintentar; el de UNA lista llega en su
 * fila (`status: 'ERROR'`) y las demás se pintan.
 */
export function WorkQueuesProvider({
  token,
  pathname,
  children,
}: {
  token: string | null;
  pathname: string;
  children: ReactNode;
}) {
  const role = getTokenRole(token);
  const menuKeys = useMemo(() => menuQueuesFor(role), [role]);
  const [fullConsumers, setFullConsumers] = useState(0);
  const wantFull = fullConsumers > 0 || FULL_PATHS.has(pathname);
  const [scope, setScope] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Último valor bueno por lista y sede, para los contadores del menú.
  const [counts, setCounts] = useState<{ scope: string; byKey: Partial<Record<WorkQueueKey, number>> }>({
    scope: 'all',
    byKey: {},
  });

  useEffect(() => {
    const read = () => setScope(getActiveLocationId() ?? 'all');
    read();
    return onLocationChange(read);
  }, []);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const subscribeFull = useCallback(() => {
    setFullConsumers((n) => n + 1);
    return () => setFullConsumers((n) => n - 1);
  }, []);

  const requestKey = `${role ?? ''}|${scope}|${wantFull ? 'full' : menuKeys.join(',')}|${reloadKey}`;

  useEffect(() => {
    if (!token || !role || (!wantFull && menuKeys.length === 0)) return;
    let cancelled = false;
    const load = () =>
      getWorkQueuesSummary(token, wantFull ? undefined : menuKeys)
        .then((summary) => {
          if (cancelled) return;
          setFailedKey(null);
          setSnapshot({ scope, full: wantFull, items: summary.items });
          setCounts((prev) => {
            const byKey = prev.scope === scope ? { ...prev.byKey } : {};
            for (const item of summary.items) {
              if (item.status === 'OK' && item.count !== null) byKey[item.key] = item.count;
            }
            return { scope, byKey };
          });
        })
        .catch(() => {
          if (!cancelled) setFailedKey(requestKey);
        });
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onChanged = () => void load();
    window.addEventListener(WORK_QUEUES_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(WORK_QUEUES_CHANGED_EVENT, onChanged);
    };
    // `requestKey` resume rol, sede, listas y reintento; `pathname` relee al navegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, requestKey, pathname]);

  const value = useMemo<Ctx>(() => {
    const current = snapshot && snapshot.full && snapshot.scope === scope ? snapshot : null;
    // Con datos de esta sede, un fallo del sondeo de fondo no tapa lo que ya
    // se ve (sigue siendo correcto hasta la próxima lectura); sin ellos, error.
    const view: WorkQueuesView = current
      ? { status: 'ready', items: current.items, retry }
      : failedKey === requestKey
        ? { status: 'error', retry }
        : { status: 'loading', retry };
    return {
      count: (key) => (counts.scope === scope ? (counts.byKey[key] ?? 0) : 0),
      view,
      subscribeFull,
    };
  }, [snapshot, scope, failedKey, requestKey, retry, counts, subscribeFull]);

  return <WorkQueuesContext.Provider value={value}>{children}</WorkQueuesContext.Provider>;
}

/** El contador de una lista (0 sin proveedor, sin permiso o sin leer aún). */
export function useWorkQueueCount(key: WorkQueueKey): number {
  return useContext(WorkQueuesContext)?.count(key) ?? 0;
}

const NO_PROVIDER: WorkQueuesView = { status: 'error', retry: () => {} };

/** «Mi día»: todas las listas del rol en la sede activa, mientras el llamador está montado. */
export function useWorkQueuesView(): WorkQueuesView {
  const ctx = useContext(WorkQueuesContext);
  const subscribe = ctx?.subscribeFull;
  useEffect(() => (subscribe ? subscribe() : undefined), [subscribe]);
  return ctx?.view ?? NO_PROVIDER;
}

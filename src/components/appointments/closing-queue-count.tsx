'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getClosingQueueCount } from '@/lib/appointments/closing-queue-api';

/** Cada cuánto se relee el contador mientras la app está abierta. */
const POLL_MS = 60_000;

/** Evento de ventana tras cerrar o descartar un pendiente: el contador se relee al momento. */
export const CLOSING_QUEUE_CHANGED_EVENT = 'dentalix:closing-queue-changed';

export function notifyClosingQueueChanged(): void {
  window.dispatchEvent(new Event(CLOSING_QUEUE_CHANGED_EVENT));
}

const ClosingQueueCountContext = createContext(0);

/**
 * DX-439: UNA lectura del contador de «Pendiente de cerrar» para toda la app
 * (el menú y el enlace de la Agenda leen la misma): las secciones del rol, en
 * sus sedes. Se relee al cambiar de pantalla, cada minuto y al recibir
 * `CLOSING_QUEUE_CHANGED_EVENT`. Un fallo deja el último valor: es un
 * contador, la página tiene su propio estado de error.
 */
export function ClosingQueueCountProvider({
  token,
  enabled,
  pathname,
  children,
}: {
  token: string | null;
  enabled: boolean;
  pathname: string;
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    const load = () =>
      getClosingQueueCount(token)
        .then((summary) => {
          if (!cancelled) setCount(summary.total);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onChanged = () => void load();
    window.addEventListener(CLOSING_QUEUE_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(CLOSING_QUEUE_CHANGED_EVENT, onChanged);
    };
  }, [token, enabled, pathname]);

  return <ClosingQueueCountContext.Provider value={enabled ? count : 0}>{children}</ClosingQueueCountContext.Provider>;
}

/** El contador del proveedor (0 sin proveedor o sin permiso). */
export function useClosingQueueCount(): number {
  return useContext(ClosingQueueCountContext);
}

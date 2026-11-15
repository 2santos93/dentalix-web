'use client';
import { useEffect } from 'react';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { screenLocation } from '@/lib/locations/sede-clock';
import { markOfflineSession, onOfflineCopyChange, syncOfflineAgenda } from '@/lib/offline/offline-agenda';
import { warmOfflinePages } from '@/lib/offline/service-worker';

/** Cada cuánto se renueva la copia mientras la agenda está abierta. */
export const OFFLINE_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * DX-405: mientras la agenda está abierta, hay conexión y la copia está
 * activada y desbloqueada en la pestaña (PIN), guarda cifrada la
 * agenda de hoy y mañana de la sede de la pantalla (la activa o, en «Todas
 * las sedes», la principal): al abrir, cada OFFLINE_SYNC_INTERVAL_MS y al
 * volver a la pestaña. Un fallo no se enseña (es una copia de reserva: la
 * siguiente vuelta lo reintenta) y deja la copia anterior.
 */
export function useOfflineAgendaSync(token: string | null, enabled: boolean): void {
  const state = useLocationsState(token ?? '');
  const locationId =
    state.status === 'ready' ? (screenLocation(state.locations, state.activeLocationId)?.id ?? null) : null;

  useEffect(() => {
    if (!enabled || !token || !locationId) return;
    let cancelled = false;
    let last = 0;
    const sync = () => {
      if (cancelled || Date.now() - last < 30_000) return;
      last = Date.now();
      // Con token, esta pestaña tiene sesión (lo marca también el arranque).
      markOfflineSession(token);
      syncOfflineAgenda(token, locationId)
        .then((saved) => {
          if (saved && !cancelled) void warmOfflinePages();
          // Copia no activada o bloqueada en la pestaña: al activarla o
          // desbloquearla (aviso de abajo) se guarda en el acto.
          if (!saved) last = 0;
        })
        .catch(() => {
          // Sin copia nueva: se queda la anterior (o ninguna). Ver arriba.
        });
    };
    sync();
    const timer = setInterval(sync, OFFLINE_SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    const stopChange = onOfflineCopyChange(sync);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopChange();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, token, locationId]);
}

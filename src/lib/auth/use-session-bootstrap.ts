'use client';
import { useEffect } from 'react';
import { bootstrapSession } from '@/lib/api/client';
import { useAuthStore } from './auth-store';
import { onLogoutElsewhere } from './session-channel';
import { clearSessionStore } from '@/lib/session/session-store';
import { onLocationChange } from '@/lib/locations/location-store';
import { forgetOfflineAgendaData, forgetOfflineSession, markOfflineSession } from '@/lib/offline/offline-agenda';

/**
 * Recupera la sesión al cargar una pantalla que la necesita (DX-062): pide un
 * access token con la cookie HttpOnly y deja `_hasHydrated` resuelto. Además,
 * si se cierra la sesión en otra pestaña del host, esta olvida su access token
 * (`RequireSession` y las imprimibles mandan entonces a /login) y vacía la caché de sesión.
 *
 * Se usa solo donde hace falta sesión (el shell de la app, las imprimibles y el
 * área de plataforma), no en las páginas públicas: allí un 401 sería ruido.
 */
export function useSessionBootstrap(): void {
  useEffect(() => {
    void bootstrapSession();
    // DX-405: la pestaña con token queda marcada como «con sesión» (en
    // sessionStorage): solo así puede guardar y enseñar la copia sin conexión.
    // El arranque CON red sin sesión válida (401 del refresh) la borra en
    // `client.ts`; un fallo de red no, porque es justo cuando hace falta.
    markOfflineSession(useAuthStore.getState().accessToken);
    const stopMark = useAuthStore.subscribe((state) => markOfflineSession(state.accessToken));
    // DX-405: la copia sin conexión de la agenda es de UNA sede: cambiar de
    // sede (aquí o en otra pestaña) la borra; la agenda guarda la nueva.
    const stopLocation = onLocationChange(() => void forgetOfflineAgendaData());
    const stopLogout = onLogoutElsewhere(() => {
      useAuthStore.getState().clear();
      // FE-031: el perfil y las sedes de la sesión cerrada tampoco se quedan.
      clearSessionStore();
      void forgetOfflineSession();
    });
    return () => {
      stopMark();
      stopLocation();
      stopLogout();
    };
  }, []);
}

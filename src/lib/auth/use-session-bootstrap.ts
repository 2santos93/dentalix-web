'use client';
import { useEffect } from 'react';
import { bootstrapSession } from '@/lib/api/client';
import { useAuthStore } from './auth-store';
import { onLogoutElsewhere } from './session-channel';
import { clearSessionStore } from '@/lib/session/session-store';

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
    return onLogoutElsewhere(() => {
      useAuthStore.getState().clear();
      // FE-031: el perfil y las sedes de la sesión cerrada tampoco se quedan.
      clearSessionStore();
    });
  }, []);
}

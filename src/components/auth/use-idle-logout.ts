'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { clearSessionStore, loadMe } from '@/lib/session/session-store';
import { forgetOfflineSession } from '@/lib/offline/offline-agenda';
import { revokeSession } from '@/components/profile/user-menu';
import {
  ACTIVITY_EVENTS,
  ACTIVITY_WRITE_THROTTLE_MS,
  DEFAULT_IDLE_MINUTES,
  IDLE_CHECK_INTERVAL_MS,
  forgetLastActivity,
  idleMinutesOrDefault,
  isIdle,
  readLastActivity,
  rememberIdleLogout,
  writeLastActivity,
} from '@/lib/auth/idle-logout';

/**
 * DX-137: cierra la sesión tras los minutos de inactividad de la clínica.
 *
 * Al vencer, PRIMERO se vacía la pantalla (el token y el perfil en memoria:
 * `RequireSession` pinta su esqueleto en el acto, sin datos de pacientes) y
 * después se revoca el refresh en la API y se borra la copia sin conexión.
 * `RequireSession` lleva a `/login?motivo=inactividad`, que dice «Sesión
 * cerrada por inactividad». La API cierra también la familia del refresh si
 * nadie la renueva (`SESSION_IDLE`).
 */
export function useIdleLogout(token: string | null): void {
  const [minutes, setMinutes] = useState(DEFAULT_IDLE_MINUTES);
  const closing = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadMe(token)
      .then((me) => {
        if (!cancelled) setMinutes(idleMinutesOrDefault(me.sessionIdleMinutes));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    closing.current = false;
    // Abrir (o recargar) la app cuenta como actividad.
    writeLastActivity(Date.now());
    let lastWrite = Date.now();

    function onActivity() {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite = now;
      writeLastActivity(now);
    }

    function check() {
      if (closing.current) return;
      if (!isIdle(readLastActivity(), Date.now(), minutes)) return;
      closing.current = true;
      rememberIdleLogout();
      useAuthStore.getState().clear();
      clearSessionStore();
      forgetLastActivity();
      void revokeSession()
        .then(() => forgetOfflineSession())
        .catch(() => undefined);
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') check();
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, {
        passive: true,
        capture: true,
      });
    }
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [token, minutes]);
}

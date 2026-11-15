'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { refreshAccessToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { onReconnect } from './connectivity';

/**
 * Sesión y conexión (DX-405). Al recargar sin red, el arranque de sesión no
 * puede renovar el access token: termina sin token, pero la sesión NO está
 * muerta (eso solo lo dice un 401). En las pantallas que tienen copia sin
 * conexión (`OFFLINE_CAPABLE_PATHS`) la guarda de sesión deja pasar y la
 * pantalla pinta su copia; al volver la red se renueva el token aquí y, si la
 * sesión murió de verdad, la guarda manda a /login como siempre.
 */
export const OFFLINE_CAPABLE_PATHS = ['/agenda'] as const;

export function isOfflineCapable(pathname: string | null): boolean {
  return pathname !== null && (OFFLINE_CAPABLE_PATHS as readonly string[]).includes(pathname);
}

let reconnecting = false;
const listeners = new Set<() => void>();

function setReconnecting(value: boolean): void {
  if (reconnecting === value) return;
  reconnecting = value;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function recoverSession(): Promise<void> {
  const { _hasHydrated, accessToken } = useAuthStore.getState();
  if (!_hasHydrated || accessToken || reconnecting) return;
  setReconnecting(true);
  try {
    await refreshAccessToken();
  } finally {
    setReconnecting(false);
  }
}

/**
 * `true` mientras se recupera la sesión tras volver la conexión: la guarda
 * espera (esqueleto) en vez de mandar a /login. Monta la escucha del regreso.
 */
export function useSessionReconnect(): boolean {
  useEffect(() => onReconnect(() => void recoverSession()), []);
  return useSyncExternalStore(subscribe, () => reconnecting, () => false);
}

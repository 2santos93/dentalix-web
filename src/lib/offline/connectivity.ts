'use client';
import { useSyncExternalStore } from 'react';

/**
 * ¿Hay conexión? (DX-405). Dos señales:
 *
 * - `navigator.onLine` y sus eventos `online`/`offline`: el equipo perdió la
 *   red (se fue la luz del router, se apagó el wifi).
 * - Un fallo de RED de una petición a la API (`reportNetworkFailure`, desde
 *   `client.ts`): el wifi sigue, pero no hay internet (caída del proveedor).
 *   Mientras dure, una sonda cada PROBE_MS a `/api/v1/health` mira si volvió;
 *   cualquier respuesta de la API (`reportNetworkSuccess`) también lo cierra.
 *
 * Al volver, `onReconnect` avisa (la agenda recupera la sesión y se recarga).
 */
export const PROBE_MS = 15_000;
const PROBE_URL = '/api/v1/health';

let networkDown = false;
let browserOffline = typeof navigator !== 'undefined' ? navigator.onLine === false : false;
let probe: ReturnType<typeof setInterval> | null = null;
let wired = false;
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

function isOffline(): boolean {
  return browserOffline || networkDown;
}

function emit(wasOffline: boolean): void {
  const offline = isOffline();
  if (offline === wasOffline) return;
  for (const l of listeners) l();
  if (!offline) for (const l of reconnectListeners) l();
}

function stopProbe(): void {
  if (probe) clearInterval(probe);
  probe = null;
}

function startProbe(): void {
  if (probe || typeof window === 'undefined') return;
  probe = setInterval(() => {
    if (browserOffline) return;
    fetch(PROBE_URL, { cache: 'no-store', credentials: 'omit' })
      .then(() => reportNetworkSuccess())
      .catch(() => undefined);
  }, PROBE_MS);
}

function wire(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  browserOffline = navigator.onLine === false;
  window.addEventListener('online', () => {
    const was = isOffline();
    browserOffline = false;
    // El sistema dice que volvió: se da por buena y la próxima petición lo confirma.
    networkDown = false;
    stopProbe();
    emit(was);
  });
  window.addEventListener('offline', () => {
    const was = isOffline();
    browserOffline = true;
    emit(was);
  });
}

/** Una petición a la API no llegó (error de red, no un 4xx/5xx). */
export function reportNetworkFailure(): void {
  if (typeof window === 'undefined') return;
  wire();
  const was = isOffline();
  networkDown = true;
  startProbe();
  emit(was);
}

/** Una petición a la API respondió: hay red. */
export function reportNetworkSuccess(): void {
  if (!networkDown) return;
  const was = isOffline();
  networkDown = false;
  stopProbe();
  emit(was);
}

function subscribe(listener: () => void): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Para código fuera de React. */
export function currentlyOffline(): boolean {
  wire();
  return isOffline();
}

/** Avisa cada vez que se pasa de sin conexión a con conexión. */
export function onReconnect(listener: () => void): () => void {
  wire();
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

/** `true` sin conexión. En el servidor, siempre `false`. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false);
}

/** Solo tests. */
export function resetConnectivityForTests(): void {
  networkDown = false;
  browserOffline = typeof navigator !== 'undefined' ? navigator.onLine === false : false;
  stopProbe();
  listeners.clear();
  reconnectListeners.clear();
}

'use client';
import { useSyncExternalStore } from 'react';

/**
 * DX-586: desde cuándo se puede volver a pulsar «Actualizar tasa» (epoch ms;
 * 0 = ya). La API deja una consulta cada 5 min por clínica: tras usarla (o
 * tras un 429 con `retryAfterSeconds`) el botón queda deshabilitado con el
 * tiempo que falta. Vive fuera del popover (que se desmonta al cerrarse) y de
 * cada indicador (sidebar, raíl y barra del teléfono son instancias distintas),
 * así que todos ven el mismo turno mientras dure la pestaña.
 */
let availableAt = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setRateRefreshAvailableAt(at: number): void {
  if (at === availableAt) return;
  availableAt = at;
  emit();
}

export function getRateRefreshAvailableAt(): number {
  return availableAt;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** El instante (epoch ms) desde el que se puede volver a actualizar; 0 = ya. */
export function useRateRefreshAvailableAt(): number {
  return useSyncExternalStore(subscribe, getRateRefreshAvailableAt, () => 0);
}

/** Para las pruebas: el turno vuelve a estar libre. */
export function resetRateRefreshForTests(): void {
  setRateRefreshAvailableAt(0);
}

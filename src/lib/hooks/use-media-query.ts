import { useSyncExternalStore } from 'react';

/**
 * `true` si la media query se cumple. Sin `matchMedia` (servidor, jsdom) es
 * `false`: la vista estrecha es la de partida y la ancha se activa al montar.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

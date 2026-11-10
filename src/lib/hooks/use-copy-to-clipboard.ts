'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

/** Cuánto se ve la marca de «copiado» antes de volver al estado normal (ms). */
export const COPIED_FEEDBACK_MS = 2000;

/**
 * Copia un texto al portapapeles y dice cómo fue (DX-484): `copied` durante
 * ~2 s (la marca ✓ y el anuncio «… copiado») y `failed` si el navegador no
 * deja (contexto no seguro, permiso denegado). Quien lo usa pinta el anuncio
 * en una región `role="status"` y, si falla, deja el texto seleccionable y le
 * dice a la persona que lo copie a mano.
 *
 * Mismo patrón que `confirmation-link-panel` y `recovery-codes-panel`, en un
 * solo sitio para las pantallas nuevas.
 */
export function useCopyToClipboard() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
      timer.current = setTimeout(() => setState('idle'), COPIED_FEEDBACK_MS);
      return true;
    } catch {
      setState('failed');
      return false;
    }
  }, []);

  return { state, copy };
}

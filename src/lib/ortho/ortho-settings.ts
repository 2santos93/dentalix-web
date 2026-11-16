import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type OrthoSettings = components['schemas']['OrthoSettingsDto'];

/** `GET /ortho/settings` (los cuatro roles). Fichero aparte: la ficha lo carga sin el resto de la ortodoncia. */
export function getOrthoSettings(token: string): Promise<OrthoSettings> {
  return apiFetch<OrthoSettings>('/ortho/settings', { token });
}

export type OrthoSettingsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; settings: OrthoSettings };

/**
 * Ajustes de ortodoncia de la clínica (los leen los cuatro roles): deciden si
 * se enseña la pestaña de la ficha y la lista. Sin respuesta, como apagado.
 */
export function useOrthoSettings(token: string | null): OrthoSettingsState {
  const [state, setState] = useState<OrthoSettingsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getOrthoSettings(token)
      .then((settings) => {
        if (!cancelled) setState({ status: 'ready', settings });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', retry: () => setReloadKey((k) => k + 1) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);
  return state;
}

/** ¿La clínica usa la ortodoncia? Solo con los ajustes ya leídos. */
export function orthoEnabled(state: OrthoSettingsState): boolean {
  return state.status === 'ready' && state.settings.enabled;
}

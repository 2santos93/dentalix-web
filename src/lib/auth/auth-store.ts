'use client';
import { create } from 'zustand';

/**
 * Sesión de la pestaña, SOLO en memoria (DX-062): el access token no se guarda
 * en localStorage ni en sessionStorage, y el refresh token vive en una cookie
 * HttpOnly que JavaScript no puede leer. Al cargar la página la sesión se
 * recupera con `bootstrapSession()` (`client.ts`).
 *
 * `_hasHydrated`: el arranque de sesión ya terminó, con o sin sesión. Hasta
 * entonces las páginas muestran «Verificando sesión…» en vez de mandar a /login.
 */
interface AuthState {
  accessToken: string | null;
  _hasHydrated: boolean;
  setAccessToken: (accessToken: string) => void;
  markResolved: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  _hasHydrated: false,
  setAccessToken: (accessToken) => set({ accessToken, _hasHydrated: true }),
  markResolved: () => set({ _hasHydrated: true }),
  clear: () => set({ accessToken: null, _hasHydrated: true }),
}));

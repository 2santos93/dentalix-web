'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      setTokens: (t) => set({ accessToken: t.accessToken, refreshToken: t.refreshToken }),
      clear: () => set({ accessToken: null, refreshToken: null }),
    }),
    { name: 'dentalix-auth' },
  ),
);

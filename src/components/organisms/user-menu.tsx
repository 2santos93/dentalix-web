'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { logout } from '@/lib/auth/auth-api';

/**
 * Menú de cuenta en el topbar. Hoy el store no guarda datos del usuario, así
 * que muestra un ícono genérico; deja lugar para "Mi perfil" a futuro. El
 * cierre de sesión es best-effort en el server (revoca el refresh) y siempre
 * limpia local + redirige, aunque el server falle.
 */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setOpen(false);
    const { refreshToken, clear } = useAuthStore.getState();
    if (refreshToken) await logout(refreshToken);
    clear();
    router.replace('/login');
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cuenta"
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-bg text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <User className="size-4" />
      </button>

      {open && (
        <>
          {/* Backdrop para cerrar al hacer clic fuera. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-bg"
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { logout } from '@/lib/auth/auth-api';
import { cn } from '@/lib/utils';

/**
 * Botón directo de cierre de sesión. Best-effort en el servidor (revoca el
 * refresh token), luego limpia la sesión local y redirige a /login aunque el
 * server falle. Se usa en el footer del sidebar (desktop) y en el topbar
 * (móvil); `label={false}` lo deja como ícono solo para espacios compactos.
 */
export function LogoutButton({
  className,
  label = true,
}: {
  className?: string;
  label?: boolean;
}) {
  const router = useRouter();

  async function handleLogout() {
    const { refreshToken, clear } = useAuthStore.getState();
    if (refreshToken) await logout(refreshToken);
    clear();
    router.replace('/login');
  }

  return (
    <button
      type="button"
      aria-label="Cerrar sesión"
      onClick={handleLogout}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <LogOut className="size-4 shrink-0" />
      {label && <span>Cerrar sesión</span>}
    </button>
  );
}

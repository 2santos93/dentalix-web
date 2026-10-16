'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryView } from '@/components/inventory/inventory-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the app's
// copy convention until next-intl wiring lands.
//
// El título y la descripción NO están aquí: los pinta `InventoryView` dentro de
// su `PageHeader`, porque la acción primaria va en esa cabecera y el estado que
// la abre es de la vista. La página solo resuelve la sesión.
const copy = {
  checkingSession: 'Verificando sesión…',
};

export default function InventoryPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the session bootstrap has resolved —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user. (Same guard as the Catalog page.)
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }

  if (!accessToken) {
    return null;
  }

  return <InventoryView token={accessToken} />;
}

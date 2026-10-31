'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryItem } from '@/components/inventory/inventory-item-detail';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
// El título, el enlace de vuelta y las acciones los pinta `InventoryItem` en su
// `PageHeader`: el título es el nombre del insumo, que solo la vista conoce.
const copy = {
  checkingSession: 'Verificando sesión…',
};

export default function InventoryItemPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const itemId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the session bootstrap has resolved —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user.
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

  return <InventoryItem token={accessToken} id={itemId} />;
}

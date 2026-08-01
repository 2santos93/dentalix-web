'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryItemDetail } from '@/components/inventory/inventory-item-detail';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  backLink: 'Volver a inventario',
  title: 'Detalle del insumo',
  checkingSession: 'Verificando sesión…',
};

export default function InventoryItemPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const itemId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/inventory" className="text-sm font-medium text-primary hover:underline">
          {copy.backLink}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{copy.title}</h1>
      </div>
      <InventoryItemDetail token={accessToken} id={itemId} />
    </div>
  );
}

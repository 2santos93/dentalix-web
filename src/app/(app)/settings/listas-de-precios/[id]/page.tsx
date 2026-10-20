'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePriceLists } from '@/lib/price-lists/price-lists-api';
import { EmptyState } from '@/components/shared/empty-state';
import { PriceListItemsView } from '@/components/price-lists/price-list-items-view';

const copy = {
  checkingSession: 'Verificando sesión…',
  forbiddenTitle: 'Solo administración gestiona las listas de precios.',
  forbiddenHint: 'Los precios se aplican solos al añadir un procedimiento a un plan.',
};

/** Precios de una lista (DX-105). Solo ADMIN. */
export default function PriceListItemsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  if (!canManagePriceLists(getTokenRole(accessToken))) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  return <PriceListItemsView token={accessToken} priceListId={params.id} />;
}

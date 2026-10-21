'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePriceLists } from '@/lib/price-lists/price-lists-api';
import { PageHeader } from '@/components/shared/page-header';
import { PriceListsManager } from '@/components/price-lists/price-lists-manager';

const copy = {
  title: 'Listas de precios',
  description:
    'Tarifas propias de una sede o de un convenio. Al añadir un procedimiento a un plan, el precio sale de la lista que corresponda; si no tiene precio ahí, del catálogo.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de las listas de precios (DX-105). Solo ADMIN. */
export default function PriceListsPage() {
  const router = useRouter();
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

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <PriceListsManager
        token={accessToken}
        allowed={canManagePriceLists(getTokenRole(accessToken))}
      />
    </>
  );
}

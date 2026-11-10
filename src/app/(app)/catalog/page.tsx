'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CatalogView } from '@/components/catalog/catalog-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

/**
 * `useSearchParams` (DX-212: `?item=<id>` abre ese ítem en edición) exige un
 * límite de Suspense, como en la ficha del paciente.
 */
export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogPageView />
    </Suspense>
  );
}

function CatalogPageView() {
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return (
    <RouteRoleGate href="/catalog" token={accessToken}>
      <CatalogView token={accessToken} initialItemId={searchParams.get('item')} />
    </RouteRoleGate>
  );
}

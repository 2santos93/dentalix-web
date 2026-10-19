'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CatalogView } from '@/components/catalog/catalog-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the app's
// copy convention until next-intl wiring lands.
const copy = {
  checkingSession: 'Verificando sesión…',
};

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the session bootstrap has resolved —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user. (Same guard as the Staff page.)
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
    <CatalogView token={accessToken} initialItemId={searchParams.get('item')} />
  );
}

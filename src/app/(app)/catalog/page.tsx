'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CatalogView } from '@/components/catalog/catalog-view';
import { PageHeader } from '@/components/molecules/page-header';

// Copy as constants (i18n-ready) — es first, matches the rest of the app's
// copy convention until next-intl wiring lands.
const copy = {
  title: 'Catálogo',
  description:
    'Procedimientos y diagnósticos reutilizables de tu clínica. Los procedimientos habilitan los ítems de los planes de tratamiento.',
  checkingSession: 'Verificando sesión…',
};

export default function CatalogPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
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
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <CatalogView token={accessToken} />
    </>
  );
}

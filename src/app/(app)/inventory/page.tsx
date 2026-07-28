'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryView } from '@/components/inventory/inventory-view';
import { PageHeader } from '@/components/molecules/page-header';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Inventario',
  description: 'Gestiona los insumos de tu clínica: crea, edita y controla el stock.',
  checkingSession: 'Verificando sesión…',
};

export default function InventoryPage() {
  const router = useRouter();
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
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <InventoryView token={accessToken} />
    </>
  );
}

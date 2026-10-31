'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { DashboardView } from '@/components/dashboard/dashboard-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * «Inicio» (I1): la pantalla de arranque de los cuatro roles. La cabecera
 * (título, línea de apoyo por rol y marca de alcance) la pinta la vista, que es
 * quien sabe el rol, la sede y su zona.
 */
export default function DashboardPage() {
  const router = useRouter();
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

  return <DashboardView token={accessToken} />;
}

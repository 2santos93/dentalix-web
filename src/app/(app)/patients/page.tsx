'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientsView } from '@/components/patients/patients-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
//
// El título y la descripción NO están aquí: los pinta `PatientsView` dentro de
// su `PageHeader`. La página solo resuelve la sesión, igual que las de
// inventario, catálogo y personal.
const copy = {
  checkingSession: 'Verificando sesión…',
};

export default function PatientsPage() {
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

  return <PatientsView token={accessToken} />;
}

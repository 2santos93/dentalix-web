'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { parseTenantFromHost } from '@/lib/tenant';
import { AgendaView } from '@/components/appointments/agenda-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Agenda',
  checkingSession: 'Verificando sesión…',
  patientsLink: 'Pacientes',
};

export default function AgendaPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const tenant = typeof window !== 'undefined' ? parseTenantFromHost(window.location.host) : null;

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
      <div className="flex min-h-full flex-1 items-center justify-center bg-bg px-4 py-8">
        <p role="status" className="text-sm text-muted">
          {copy.checkingSession}
        </p>
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-6 bg-bg px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
          <Link href="/patients" className="text-sm font-medium text-primary">
            {copy.patientsLink}
          </Link>
        </div>
        <ThemeToggle />
      </div>

      <AgendaView token={accessToken} tenant={tenant} />
    </div>
  );
}

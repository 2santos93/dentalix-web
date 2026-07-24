'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientForm } from '@/components/patients/patient-form';
import { ThemeToggle } from '@/components/theme/theme-toggle';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Nuevo paciente',
  backLink: 'Volver a pacientes',
  checkingSession: 'Verificando sesión…',
};

export default function NewPatientPage() {
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/patients" className="text-sm font-medium text-primary">
            {copy.backLink}
          </Link>
          <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm">
        <PatientForm token={accessToken} />
      </div>
    </div>
  );
}

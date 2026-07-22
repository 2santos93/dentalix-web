'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { PatientsTable } from '@/components/patients/patients-table';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Pacientes',
  newPatient: 'Nuevo paciente',
  genericError: 'No pudimos cargar los pacientes. Intenta de nuevo.',
};

export default function PatientsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }

    const tenant =
      typeof window !== 'undefined' ? parseTenantFromHost(window.location.host) : null;

    let cancelled = false;

    listPatients(accessToken, {}, tenant)
      .then((res) => {
        if (cancelled) return;
        setPatients(res.items);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : copy.genericError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, router]);

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-6 bg-bg px-4 py-8 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/patients/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {copy.newPatient}
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <PatientsTable patients={patients} loading={loading} />
    </div>
  );
}

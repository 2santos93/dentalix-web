'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { PatientsTable } from '@/components/organisms/patients-table';
import { PageHeader } from '@/components/molecules/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Pacientes',
  description: 'Gestiona la base de pacientes de tu clínica.',
  newPatient: 'Nuevo paciente',
  genericError: 'No pudimos cargar los pacientes. Intenta de nuevo.',
  retry: 'Reintentar',
  checkingSession: 'Verificando sesión…',
};

export default function PatientsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user.
    if (!hasHydrated) return;

    if (!accessToken) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    listPatients(accessToken, {})
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
  }, [accessToken, router, hasHydrated, retryCount]);

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
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild>
            <Link href="/patients/new">
              <Plus /> {copy.newPatient}
            </Link>
          </Button>
        }
      />

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setError(null);
                setRetryCount((c) => c + 1);
              }}
            >
              {copy.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PatientsTable patients={patients} loading={loading} />
      )}
    </>
  );
}

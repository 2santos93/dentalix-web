'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientForm } from '@/components/patients/patient-form';
import { PageHeader } from '@/components/molecules/page-header';
import { Card, CardContent } from '@/components/ui/card';

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
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/patients"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> {copy.backLink}
      </Link>
      <PageHeader title={copy.title} />
      <Card>
        <CardContent className="p-6">
          <PatientForm token={accessToken} />
        </CardContent>
      </Card>
    </div>
  );
}

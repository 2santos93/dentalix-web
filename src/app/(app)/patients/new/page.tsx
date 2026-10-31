'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientCreateWizard } from '@/components/patients/patient-create-wizard';
import { PageHeader } from '@/components/shared/page-header';
import { getTokenRole } from '@/lib/auth/token-role';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Nuevo paciente',
  backLink: 'Pacientes',
  description: 'Para crearlo bastan nombre, apellido y tipo de documento; lo demás se puede completar después.',
  checkingSession: 'Verificando sesión…',
};

export default function NewPatientPage() {
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

  return (
    // Columna de formulario alineada al borde del contenido, como el resto de pantallas.
    <div className="w-full max-w-4xl">
      <PageHeader
        back={{ href: '/patients', label: copy.backLink }}
        title={copy.title}
        description={copy.description}
      />
      <PatientCreateWizard
        token={accessToken}
        canWriteClinicalHistory={canWriteClinicalHistory(getTokenRole(accessToken))}
      />
    </div>
  );
}

'use client';
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
};

export default function NewPatientPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

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

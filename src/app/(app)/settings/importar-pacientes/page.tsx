'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canImportPatients } from '@/lib/patient-imports/patient-imports-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { PatientImportScreen } from '@/components/patient-imports/patient-import-screen';

const copy = {
  title: 'Importar pacientes',
  description:
    'Trae tus pacientes desde Excel u otro programa: valida el archivo sin guardar nada, revisa duplicados y errores, e importa en segundo plano sin parar la clínica.',
  checkingSession: 'Verificando sesión…',
};

/** Importación de pacientes desde CSV/XLSX (DX-107). Solo ADMIN. */
export default function PatientImportSettingsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <PatientImportScreen token={accessToken} allowed={canImportPatients(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}

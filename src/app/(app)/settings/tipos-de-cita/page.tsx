'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { AppointmentTypesManager } from '@/components/appointment-types/appointment-types-manager';

const copy = {
  title: 'Tipos de cita',
  description:
    'Duración y color de cada tipo de cita. Al agendar, el tipo fija la hora de fin; en la agenda, pinta la cita.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de tipos de cita (DX-121). Solo ADMIN. */
export default function AppointmentTypesPage() {
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
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      {/* Plantilla de Ajustes: columna de 720 px alineada a la izquierda. */}
      <div className="w-full max-w-[45rem]">
        <AppointmentTypesManager
          token={accessToken}
          allowed={canManageAppointmentTypes(getTokenRole(accessToken))}
        />
      </div>
    </>
  );
}

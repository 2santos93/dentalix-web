'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { AppointmentTypesManager } from '@/components/appointment-types/appointment-types-manager';

const copy = {
  title: 'Tipos de cita',
  description:
    'Duración y color de cada tipo de cita. Al agendar, el tipo fija la hora de fin; en la agenda, pinta la cita.',
};

/** Gestión de tipos de cita (DX-121). Solo ADMIN. */
export default function AppointmentTypesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <AppointmentTypesManager
        token={accessToken}
        allowed={canManageAppointmentTypes(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

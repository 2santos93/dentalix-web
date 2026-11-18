'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageOnlineBooking } from '@/lib/online-booking/online-booking-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { OnlineBookingSettingsSection } from '@/components/online-booking/online-booking-settings';

const copy = {
  title: 'Reserva online',
  description: 'La página donde los pacientes piden o reservan su cita por internet, y qué tratamientos ofrece.',
};

/**
 * Ajustes › Reserva online (DX-016). La leen los roles de la agenda; solo
 * ADMIN la cambia (la API también lo exige).
 */
export default function OnlineBookingSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <OnlineBookingSettingsSection
        token={accessToken}
        allowed={canManageOnlineBooking(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

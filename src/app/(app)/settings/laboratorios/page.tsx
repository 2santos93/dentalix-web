'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage } from '@/components/settings/settings-page';
import { DentalLabsManager } from '@/components/lab-orders/dental-labs-manager';

const copy = {
  title: 'Laboratorios dentales',
  description: 'Los laboratorios a los que se mandan coronas y prótesis, con sus servicios y plazos.',
};

/**
 * Ajustes › Laboratorios dentales (DX-017). ADMIN gestiona; los demás roles lo
 * ven sin botones (lo leen para elegir laboratorio y servicio en la orden).
 */
export default function DentalLabsSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <DentalLabsManager token={accessToken} />
    </SettingsPage>
  );
}

'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage } from '@/components/settings/settings-page';
import { PrivacyPolicySettings } from '@/components/data-consents/privacy-policy-settings';

const copy = {
  title: 'Privacidad de datos',
  description:
    'La política de tratamiento de datos que ven y autorizan los pacientes. Cada versión publicada queda fija.',
};

/**
 * Política de tratamiento de datos de la clínica (DX-037). Todos los roles la
 * leen; publicar una versión es solo de ADMIN (la API lo exige y la vista solo
 * le muestra el botón a ese rol).
 */
export default function PrivacySettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    // Plantilla de Ajustes: columna de 720 px alineada a la izquierda (antes centrada).
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <PrivacyPolicySettings token={accessToken} />
    </SettingsPage>
  );
}

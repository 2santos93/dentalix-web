'use client';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCertificateSettings } from '@/lib/certificates/certificates-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { CertificateSettingsForm } from '@/components/certificates/certificate-settings-form';

const copy = {
  title: 'Certificados',
  description: 'Días de reposo y diagnóstico en los certificados del paciente.',
  settingsTitle: 'Certificado de reposo',
  settingsDescription:
    'Se aplican a los certificados que se emitan desde ahora. Los ya emitidos no cambian.',
  forbiddenTitle: 'Solo administración cambia los ajustes de los certificados.',
  forbiddenHint: 'Los certificados se emiten con los ajustes que fije administración.',
};

/**
 * Ajustes › Certificados (DX-306): máximo de días de reposo y si el reposo
 * imprime el diagnóstico. Solo ADMIN: sin permiso, un único aviso de página y
 * sin montar el formulario (ni pedir nada a la API).
 */
export default function CertificateSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  const allowed = canManageCertificateSettings(getTokenRole(accessToken));
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      {allowed ? (
        <SettingsSection title={copy.settingsTitle} description={copy.settingsDescription}>
          <CertificateSettingsForm token={accessToken} />
        </SettingsSection>
      ) : (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
      )}
    </SettingsPage>
  );
}

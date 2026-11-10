'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDocumentTypeNames } from '@/lib/patients/document-type-names-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { DocumentTypeNamesSettingsSection } from '@/components/patients/document-type-names-settings';

const copy = {
  title: 'Nombres de documentos',
  description: 'Cómo se llama cada tipo de documento en tu clínica. Se usa en fichas, recibos, recetas y consentimientos, y al importar pacientes.',
};

/** Ajustes de los nombres de documentos de la clínica (DX-327). Solo ADMIN. */
export default function DocumentTypeNamesSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <DocumentTypeNamesSettingsSection
        token={accessToken}
        allowed={canManageDocumentTypeNames(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

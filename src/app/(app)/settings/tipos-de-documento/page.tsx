'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDocumentTypeNames } from '@/lib/patients/document-type-names-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { DocumentTypeNamesSettingsSection } from '@/components/patients/document-type-names-settings';

const copy = {
  title: 'Nombres de documentos',
  description: 'Cómo se llama cada tipo de documento en tu clínica. Se usa en fichas, recibos, recetas y consentimientos, y al importar pacientes.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de los nombres de documentos de la clínica (DX-327). Solo ADMIN. */
export default function DocumentTypeNamesSettingsPage() {
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
      <DocumentTypeNamesSettingsSection
        token={accessToken}
        allowed={canManageDocumentTypeNames(getTokenRole(accessToken))}
      />
    </>
  );
}

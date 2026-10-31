'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageConsentTemplates } from '@/lib/consents/consents-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ConsentTemplatesManager } from '@/components/consents/consent-templates-manager';

const copy = {
  title: 'Consentimientos informados',
  description:
    'Plantillas que el equipo clínico firma con el paciente desde su ficha. Editar una plantilla no cambia los consentimientos ya firmados.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de plantillas de consentimiento (DX-006). Solo ADMIN. */
export default function ConsentTemplatesPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <ConsentTemplatesManager
        token={accessToken}
        allowed={canManageConsentTemplates(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

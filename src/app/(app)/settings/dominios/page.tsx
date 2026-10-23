'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDomains } from '@/lib/domains/domains-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { DomainsManager } from '@/components/domains/domains-manager';

const copy = {
  title: 'Dominios propios',
  description:
    'Un dominio de tu clínica desde el que el equipo entra a Dentalix. Solo abre la plataforma mientras su registro TXT siga publicado.',
  checkingSession: 'Verificando sesión…',
};

/** Dominios propios de la clínica (SEC-009). Solo ADMIN. */
export default function DomainsSettingsPage() {
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
      <DomainsManager token={accessToken} allowed={canManageDomains(getTokenRole(accessToken))} />
    </>
  );
}

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDomains } from '@/lib/domains/domains-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { DomainsManager } from '@/components/domains/domains-manager';

const copy = {
  title: 'Dominios propios',
  description:
    // La condición del registro TXT (DNS) se explica al añadir el dominio, no aquí.
    'Un dominio propio de tu clínica, además de su dirección en Dentalix, desde el que el equipo entra a la plataforma.',
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <DomainsManager token={accessToken} allowed={canManageDomains(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}

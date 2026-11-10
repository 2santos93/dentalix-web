'use client';
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
};

/** Dominios propios de la clínica (SEC-009). Solo ADMIN. */
export default function DomainsSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <DomainsManager token={accessToken} allowed={canManageDomains(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}

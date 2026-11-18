'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageQuoteFollowUp } from '@/lib/treatment-plans/quote-follow-up-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { QuoteFollowUpSettingsManager } from '@/components/treatment-plans/quote-follow-up-settings-manager';

const copy = {
  title: 'Seguimiento automático',
  description:
    'Emails automáticos a los pacientes con un presupuesto presentado y sin respuesta, con un enlace para verlo y aceptarlo.',
  back: 'Presupuestos',
};

/** Seguimiento automático de presupuestos presentados, por sede (DX-561). Solo ADMIN. */
export default function QuoteFollowUpSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage
      title={copy.title}
      description={copy.description}
      scope="sede"
      back={{ href: '/settings/presupuestos', label: copy.back }}
    >
      <QuoteFollowUpSettingsManager
        token={accessToken}
        allowed={canManageQuoteFollowUp(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

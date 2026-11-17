'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage } from '@/components/settings/settings-page';
import { CommissionRulesManager } from '@/components/commissions/commission-rules-manager';

const copy = {
  title: 'Honorarios',
  description: 'Qué porcentaje cobra cada odontólogo: sobre lo cobrado o lo producido, y cuándo se libera.',
};

/** Ajustes › Honorarios (DX-018): solo ADMIN (la API responde 403 a los demás). */
export default function CommissionSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <CommissionRulesManager token={accessToken} />
    </SettingsPage>
  );
}

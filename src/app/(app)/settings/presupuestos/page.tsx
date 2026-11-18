'use client';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageQuoteSettings } from '@/lib/treatment-plans/quote-settings-api';
import { canManageQuoteFollowUp } from '@/lib/treatment-plans/quote-follow-up-api';
import { SettingRow, SettingRows, SettingsPage } from '@/components/settings/settings-page';
import { QuoteValiditySettingsSection } from '@/components/treatment-plans/quote-validity-settings';
import { Button } from '@/components/ui/button';

const copy = {
  title: 'Presupuestos',
  description: 'Hasta qué día valen los precios de un presupuesto y su seguimiento automático.',
  followUp: 'Seguimiento automático',
  followUpHint:
    'Emails por sede a quien tiene un presupuesto presentado sin respuesta, con un enlace para verlo y aceptarlo.',
  followUpAction: 'Configurar',
  followUpActionLabel: 'Configurar el seguimiento automático',
};

/**
 * Ajustes de presupuestos (DX-379): cuántos días vale un presupuesto. La leen
 * todos los roles; solo ADMIN la cambia (la API también lo exige). DX-561: la
 * entrada al seguimiento automático por sede (subpantalla, solo ADMIN).
 */
export default function QuoteSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  const role = getTokenRole(accessToken);

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <QuoteValiditySettingsSection token={accessToken} allowed={canManageQuoteSettings(role)} />
      {canManageQuoteFollowUp(role) ? (
        <SettingRows>
          <SettingRow
            label={copy.followUp}
            description={copy.followUpHint}
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/settings/presupuestos/seguimiento" aria-label={copy.followUpActionLabel}>
                  {copy.followUpAction}
                </Link>
              </Button>
            }
          />
        </SettingRows>
      ) : null}
    </SettingsPage>
  );
}

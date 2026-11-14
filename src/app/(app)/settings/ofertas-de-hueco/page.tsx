'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageSlotOfferSettings } from '@/lib/appointments/slot-offer-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { SlotOfferSettingsSection } from '@/components/appointments/slot-offer-settings';

const copy = {
  title: 'Ofertas de hueco',
  description: 'Cuánto vale el enlace con que se ofrece un hueco libre a la lista de espera.',
};

/**
 * Ajustes de las ofertas de hueco por enlace (DX-448): caducidad anticipada y
 * antelación mínima. Los leen los roles de la agenda; solo ADMIN los cambia
 * (la API también lo exige).
 */
export default function SlotOfferSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <SlotOfferSettingsSection
        token={accessToken}
        allowed={canManageSlotOfferSettings(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

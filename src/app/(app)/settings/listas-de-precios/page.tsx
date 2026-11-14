'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePriceLists } from '@/lib/price-lists/price-lists-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { PriceListsManager } from '@/components/price-lists/price-lists-manager';

const copy = {
  title: 'Listas de precios',
  description:
    'Tarifas propias de una sede o de un convenio. Al añadir un procedimiento a un plan, el precio sale de la lista que corresponda; si no tiene precio ahí, del catálogo.',
};

/** Gestión de las listas de precios (DX-105). Solo ADMIN. */
export default function PriceListsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <PriceListsManager
        token={accessToken}
        allowed={canManagePriceLists(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

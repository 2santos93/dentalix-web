'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDiscounts } from '@/lib/discounts/discounts-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { DiscountPolicyManager } from '@/components/discounts/discount-policy-manager';

const copy = {
  title: 'Descuentos',
  description:
    'Cuánto puede descontar cada rol en un ítem del plan y cuándo hay que decir el motivo. Se aplica a cada descuento, en cualquier dispositivo.',
};

/** Política de descuentos de la clínica (DX-204). Solo ADMIN. */
export default function DiscountSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <DiscountPolicyManager token={accessToken} allowed={canManageDiscounts(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}

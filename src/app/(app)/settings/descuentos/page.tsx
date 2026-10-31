'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDiscounts } from '@/lib/discounts/discounts-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { DiscountPolicyManager } from '@/components/discounts/discount-policy-manager';

const copy = {
  title: 'Descuentos',
  description:
    'Cuánto puede descontar cada rol en un ítem del plan y cuándo hay que decir el motivo. Se aplica a cada descuento, en cualquier dispositivo.',
  checkingSession: 'Verificando sesión…',
};

/** Política de descuentos de la clínica (DX-204). Solo ADMIN. */
export default function DiscountSettingsPage() {
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
      <DiscountPolicyManager token={accessToken} allowed={canManageDiscounts(getTokenRole(accessToken))} />
    </>
  );
}

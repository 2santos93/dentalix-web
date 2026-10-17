'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { DiscountReportView } from '@/components/discounts/discount-report-view';

// Informe de descuentos (DX-204). Vive junto a la cartera (mismo dato de cobro)
// y con el mismo guard de sesión; un rol sin acceso que llegue por URL ve el
// aviso de la propia vista (la API responde 403 en español).
const copy = {
  checkingSession: 'Verificando sesión…',
};

export default function DescuentosPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }

  if (!accessToken) {
    return null;
  }

  return <DiscountReportView token={accessToken} />;
}

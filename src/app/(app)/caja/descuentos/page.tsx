'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { DiscountReportView } from '@/components/discounts/discount-report-view';

// Informe de descuentos (DX-204). Vive junto a la cartera (mismo dato de cobro)
// y con el mismo guard de sesión; un rol sin acceso que llegue por URL ve el
// aviso de la propia vista (la API responde 403 en español).
export default function DescuentosPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return <DiscountReportView token={accessToken} />;
}

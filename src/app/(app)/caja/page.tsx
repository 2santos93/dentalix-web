'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CashRegisterView } from '@/components/payments/cash-register-view';

// Mismo guard de sesión que Inventario/Catálogo. Título y descripción los pinta
// `CashRegisterView` en su `PageHeader`; la página solo resuelve la sesión.
// Un rol sin acceso que llegue por URL ve el aviso de la propia vista (la API
// responde 403): el menú ya no le enseña la entrada, pero la frontera es el
// servidor.
const copy = {
  checkingSession: 'Verificando sesión…',
};

export default function CajaPage() {
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

  return <CashRegisterView token={accessToken} />;
}

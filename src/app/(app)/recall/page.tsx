'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { RecallView } from '@/components/recall/recall-view';

// Lista de recall (DX-015). Mismo guard de sesión que la caja. Un rol sin
// acceso que llegue por URL ve el aviso de la propia vista (la API responde 403).
export default function RecallPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        Verificando sesión…
      </p>
    );
  }
  if (!accessToken) return null;
  return <RecallView token={accessToken} />;
}

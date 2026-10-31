'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ClosingQueueView } from '@/components/appointments/closing-queue-view';

// «Pendiente de cerrar» (DX-439), desde la Agenda. Mismo guard de sesión que
// el resto: un rol sin acceso que llegue por URL ve el aviso de la vista (la
// API da 403 en español).
const copy = { checkingSession: 'Verificando sesión…' };

export default function ClosingQueuePage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;
  return <ClosingQueueView token={accessToken} />;
}

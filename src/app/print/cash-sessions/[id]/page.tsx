'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canUseCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { CashSessionPrintView } from '@/components/cash-sessions/cash-session-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Informe de cierre de caja imprimible (DX-027), en A4. Vive FUERA del grupo
 * `(app)`, como el recibo de caja: solo el documento, que es lo que sale en el
 * papel o en el PDF. La sesión se recupera de la cookie HttpOnly (DX-062).
 */
export default function CashSessionPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  useSessionBootstrap();

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, hasHydrated, router]);

  if (!hasHydrated) {
    return (
      <p role="status" className="px-4 py-8 text-center text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return (
    <CashSessionPrintView
      token={accessToken}
      sessionId={params.id}
      allowed={canUseCashSessions(getTokenRole(accessToken))}
    />
  );
}

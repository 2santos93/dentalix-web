'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CashSessionDetailView } from '@/components/cash-sessions/cash-session-detail-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/** Un turno de caja (DX-027). Mismo guard de sesión que la caja. */
export default function CashSessionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, hasHydrated, router]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return <CashSessionDetailView token={accessToken} sessionId={params.id} />;
}

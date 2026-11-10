'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CashSessionDetailView } from '@/components/cash-sessions/cash-session-detail-view';

/** Un turno de caja (DX-027). Mismo guard de sesión que la caja. */
export default function CashSessionPage() {
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return <CashSessionDetailView token={accessToken} sessionId={params.id} />;
}

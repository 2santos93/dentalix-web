'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CommissionSettlementView } from '@/components/commissions/commission-settlement-view';

// Una liquidación de honorarios cerrada (DX-018).
export default function CommissionSettlementPage() {
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <CommissionSettlementView token={accessToken} id={params.id} />;
}

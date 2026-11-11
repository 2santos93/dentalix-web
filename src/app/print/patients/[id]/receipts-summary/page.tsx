'use client';
import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canRecordPayments } from '@/lib/payments/billable-plans-api';
import { ReceiptsSummaryPrintView } from '@/components/payments/receipts-summary-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible del recibo resumen de un periodo (DX-401):
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Vive FUERA del grupo `(app)`, como el
 * estado de cuenta y el recibo de caja: solo el documento. La sesión se
 * recupera de la cookie HttpOnly (DX-062).
 *
 * `useSearchParams` exige un límite de Suspense.
 */
export default function ReceiptsSummaryPrintPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptsSummaryPrintRoute />
    </Suspense>
  );
}

function ReceiptsSummaryPrintRoute() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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

  // Un rol sin permiso de cobro (enlace compartido) ve el aviso sin pedir nada.
  return (
    <ReceiptsSummaryPrintView
      token={accessToken}
      patientId={params.id}
      from={searchParams.get('from')}
      to={searchParams.get('to')}
      allowed={canRecordPayments(getTokenRole(accessToken))}
    />
  );
}

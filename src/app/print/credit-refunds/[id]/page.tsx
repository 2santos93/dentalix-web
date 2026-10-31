'use client';
import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canMoveCredit } from '@/lib/patient-credit/patient-credit-api';
import { CreditRefundPrintView } from '@/components/patient-credit/credit-refund-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible del comprobante de devolución de saldo a favor (DX-253):
 * `?formato=80mm` para la tirilla; sin él, A4. Fuera del grupo `(app)`, como
 * el recibo de caja; la sesión sale de la cookie HttpOnly (DX-062).
 * `useSearchParams` exige un límite de Suspense.
 */
export default function CreditRefundPrintPage() {
  return (
    <Suspense fallback={null}>
      <CreditRefundPrintRoute />
    </Suspense>
  );
}

function CreditRefundPrintRoute() {
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

  return (
    <CreditRefundPrintView
      token={accessToken}
      refundId={params.id}
      format={searchParams.get('formato') === '80mm' ? '80mm' : 'a4'}
      allowed={canMoveCredit(getTokenRole(accessToken))}
    />
  );
}

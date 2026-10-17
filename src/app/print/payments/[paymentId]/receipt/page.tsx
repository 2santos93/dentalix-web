'use client';
import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canRecordPayments } from '@/lib/payments/billable-plans-api';
import { PaymentReceiptPrintView } from '@/components/payments/payment-receipt-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible del recibo de caja (DX-136): `?formato=80mm` para la
 * tirilla de impresora térmica; sin él, A4. Vive FUERA del grupo `(app)`,
 * como el estado de cuenta: solo el documento, que es lo que sale en el papel
 * o en el PDF. La sesión se recupera de la cookie HttpOnly (DX-062), así que
 * se abre en otra pestaña desde la ficha sin volver a iniciar sesión.
 *
 * `useSearchParams` exige un límite de Suspense (como la ficha del paciente).
 */
export default function PaymentReceiptPrintPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReceiptPrintRoute />
    </Suspense>
  );
}

function PaymentReceiptPrintRoute() {
  const router = useRouter();
  const params = useParams<{ paymentId: string }>();
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
    <PaymentReceiptPrintView
      token={accessToken}
      paymentId={params.paymentId}
      format={searchParams.get('formato') === '80mm' ? '80mm' : 'a4'}
      allowed={canRecordPayments(getTokenRole(accessToken))}
    />
  );
}

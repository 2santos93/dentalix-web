'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canUseConsents } from '@/lib/consents/consents-api';
import { ConsentPrintView } from '@/components/consents/consent-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible de un consentimiento firmado (DX-006). Fuera del grupo
 * `(app)` como la del estado de cuenta: sin raíl ni pestañas, solo el
 * documento. Comparte la sesión (la cookie HttpOnly del host) con la ficha,
 * que la abre en otra pestaña.
 */
export default function ConsentPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string; consentId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  // Pestaña nueva: la sesión se recupera de la cookie HttpOnly (DX-062).
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
    <ConsentPrintView
      token={accessToken}
      patientId={params.id}
      consentId={params.consentId}
      allowed={canUseConsents(getTokenRole(accessToken))}
    />
  );
}

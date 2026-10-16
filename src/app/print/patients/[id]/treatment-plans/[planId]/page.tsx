'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { patientTabAccess } from '@/lib/patients/patient-tab-access';
import { canPrintPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { PlanQuotePrintView } from '@/components/treatment-plans/plan-quote-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible A4 del presupuesto de un plan (DX-012). Fuera del grupo
 * `(app)` como la del consentimiento y la receta: sin raíl ni pestañas, solo el
 * documento. Comparte la sesión (la cookie HttpOnly del host) con la ficha, que
 * la abre en otra pestaña. «Volver» lleva a la pestaña desde la que el rol la
 * abre: el plan (clínicos) o el estado de cuenta (recepción).
 */
export default function PlanQuotePrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string; planId: string }>();
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

  const role = getTokenRole(accessToken);
  const access = patientTabAccess(role);
  const tab = access['treatment-plans']
    ? 'treatment-plans'
    : access['account-statement']
      ? 'account-statement'
      : 'data';

  return (
    <PlanQuotePrintView
      token={accessToken}
      patientId={params.id}
      planId={params.planId}
      backHref={`/patients/${encodeURIComponent(params.id)}?tab=${tab}`}
      allowed={canPrintPlanQuote(role)}
    />
  );
}

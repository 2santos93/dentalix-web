'use client';
import { useCallback, useEffect } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { patientTabAccess } from '@/lib/patients/patient-tab-access';
import { canPrintPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { decodeFinancing, FINANCING_PARAM } from '@/lib/treatment-plans/installment-simulation';
import {
  parsePresentationMode,
  planTabHref,
  PRESENTATION_VIEW_PARAM,
  type PresentationMode,
} from '@/lib/treatment-plans/plan-presentation';
import { PlanPresentationView } from '@/components/treatment-plans/plan-presentation-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * DX-560 · «Presentar» el plan al paciente, fuera del grupo `(app)` como las
 * vistas imprimibles: sin raíl, menú, búsqueda ni avisos; solo el plan. La
 * sesión es la de la ficha (cookie HttpOnly, DX-062). La vista va en
 * `?vista=` (completa, clinica, economica) y las cuotas de «Financiar» en
 * `?cuotas=`. «Cerrar» y Escape vuelven a la ficha con este plan elegido.
 */
export default function PlanPresentationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string; planId: string }>();
  const searchParams = useSearchParams();
  const mode = parsePresentationMode(searchParams.get(PRESENTATION_VIEW_PARAM));
  const financing = decodeFinancing(searchParams.get(FINANCING_PARAM));
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  useSessionBootstrap();

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, hasHydrated, router]);

  // La vista en la URL sin llenar el historial (Escape sigue volviendo a la ficha).
  const setMode = useCallback(
    (next: PresentationMode) => {
      const query = new URLSearchParams(searchParams.toString());
      if (next === 'completa') query.delete(PRESENTATION_VIEW_PARAM);
      else query.set(PRESENTATION_VIEW_PARAM, next);
      const text = query.toString();
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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

  return (
    <PlanPresentationView
      token={accessToken}
      role={role}
      patientId={params.id}
      planId={params.planId}
      mode={mode}
      onModeChange={setMode}
      closeHref={
        access['treatment-plans']
          ? planTabHref(params.id, params.planId)
          : `/patients/${encodeURIComponent(params.id)}`
      }
      allowed={canPrintPlanQuote(role)}
      canReadPlan={access['treatment-plans']}
      financing={financing}
    />
  );
}

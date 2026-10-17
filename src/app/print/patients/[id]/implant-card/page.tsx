'use client';
import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { ImplantCardPrintView } from '@/components/implants/implant-card-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible de la tarjeta de implante de una intervención (DX-191):
 * `?date=YYYY-MM-DD`. Fuera del grupo `(app)` como la receta: sin raíl ni
 * pestañas, solo el documento. La ven los cuatro roles (recepción la entrega).
 */
export default function ImplantCardPrintPage() {
  return (
    <Suspense fallback={null}>
      <ImplantCardPrintRoute />
    </Suspense>
  );
}

function ImplantCardPrintRoute() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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
    <ImplantCardPrintView
      token={accessToken}
      patientId={params.id}
      date={searchParams.get('date') ?? ''}
    />
  );
}

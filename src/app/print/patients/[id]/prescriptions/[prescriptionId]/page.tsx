'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canUsePrescriptions } from '@/lib/prescriptions/prescriptions-api';
import { PrescriptionPrintView } from '@/components/prescriptions/prescription-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible A4 de una receta (DX-013). Fuera del grupo `(app)` como la
 * del consentimiento: sin raíl ni pestañas, solo el documento. Comparte la
 * sesión (la cookie HttpOnly del host) con la ficha, que la abre en otra
 * pestaña.
 */
export default function PrescriptionPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string; prescriptionId: string }>();
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
    <PrescriptionPrintView
      token={accessToken}
      patientId={params.id}
      prescriptionId={params.prescriptionId}
      allowed={canUsePrescriptions(getTokenRole(accessToken))}
    />
  );
}

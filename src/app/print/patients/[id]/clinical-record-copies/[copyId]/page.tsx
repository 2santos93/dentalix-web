'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import { canGenerateClinicalRecordCopy } from '@/lib/patients/clinical-record-copies-api';
import { ClinicalRecordCopyPrintView } from '@/components/patients/clinical-record-copy-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible de una copia de la historia clínica (DX-456). Vive FUERA
 * del grupo `(app)`, como el resto de impresos: solo el documento. La sesión
 * se recupera de la cookie HttpOnly (DX-062).
 */
export default function ClinicalRecordCopyPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string; copyId: string }>();
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

  // Un rol no clínico (enlace compartido) ve el aviso sin pedir nada.
  return (
    <ClinicalRecordCopyPrintView
      token={accessToken}
      patientId={params.id}
      copyId={params.copyId}
      allowed={canGenerateClinicalRecordCopy(getTokenRole(accessToken))}
    />
  );
}

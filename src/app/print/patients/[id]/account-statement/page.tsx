'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canReadAccountStatement } from '@/lib/account-statement/account-statement-api';
import { AccountStatementPrintView } from '@/components/account-statement/account-statement-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible del estado de cuenta (DX-011). Vive FUERA del grupo `(app)`
 * a propósito: sin raíl, sin barra superior, sin pestañas — solo el documento,
 * que es lo que tiene que salir en el papel o en el PDF. La sesión es la misma
 * (el par de tokens vive en localStorage, compartido entre pestañas), así que
 * se abre en otra pestaña desde la ficha sin volver a iniciar sesión.
 */
export default function AccountStatementPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Como en la ficha: no se decide nada hasta rehidratar el store persistido.
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

  // Un rol sin acceso (enlace compartido) ve el aviso sin llegar a pedir nada:
  // la ficha ya le oculta la pestaña y el botón; aquí se cierra la URL directa.
  return (
    <AccountStatementPrintView
      token={accessToken}
      patientId={params.id}
      allowed={canReadAccountStatement(getTokenRole(accessToken))}
    />
  );
}

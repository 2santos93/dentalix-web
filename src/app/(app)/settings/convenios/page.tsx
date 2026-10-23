'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAgreements } from '@/lib/agreements/agreements-api';
import { PageHeader } from '@/components/shared/page-header';
import { AgreementsManager } from '@/components/agreements/agreements-manager';

const copy = {
  title: 'Convenios',
  description:
    'Condiciones pactadas con un pagador: un descuento porcentual o una lista de precios propia. Se asignan al paciente desde su ficha y fijan el precio al añadir un procedimiento a su plan.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de convenios con pagadores (DX-105). Solo ADMIN. */
export default function AgreementsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <AgreementsManager
        token={accessToken}
        allowed={canManageAgreements(getTokenRole(accessToken))}
      />
    </>
  );
}

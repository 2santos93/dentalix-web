'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePayers } from '@/lib/payers/payers-api';
import { PageHeader } from '@/components/shared/page-header';
import { PayersManager } from '@/components/payers/payers-manager';

const copy = {
  title: 'Pagadores',
  description:
    'Aseguradoras, EPS, mutuas y empresas que cubren a tus pacientes. Al registrar la cobertura de un paciente, eliges el pagador de esta lista.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión del catálogo de pagadores (DX-153). Solo ADMIN. */
export default function PayersPage() {
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
      <PayersManager
        token={accessToken}
        allowed={canManagePayers(getTokenRole(accessToken))}
      />
    </>
  );
}

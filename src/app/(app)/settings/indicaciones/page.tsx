'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePostOpTemplates } from '@/lib/postop/postop-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { PostOpTemplatesManager } from '@/components/postop/postop-templates-manager';

const copy = {
  title: 'Indicaciones postoperatorias',
  description:
    'Los cuidados que se entregan al paciente al terminar la cita. Editarlas sube la versión; las ya entregadas no cambian.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de plantillas de indicaciones postoperatorias (DX-222). Solo ADMIN. */
export default function PostOpTemplatesPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <PostOpTemplatesManager
        token={accessToken}
        allowed={canManagePostOpTemplates(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}

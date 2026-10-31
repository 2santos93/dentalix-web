'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage } from '@/components/settings/settings-page';
import { SupportAccessesView } from '@/components/support-accesses/support-accesses-view';

const copy = {
  title: 'Accesos de soporte',
  description:
    'Cada vez que alguien del soporte de Dentalix entró a la clínica sin ser parte del equipo: quién, cuándo, por qué y hasta cuándo. El registro no se puede editar ni borrar.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Accesos de soporte (break-glass) de Dentalix a la clínica (SEC-008). Solo
 * ADMIN: el índice de Ajustes solo le enseña la entrada a ese rol y la API
 * responde 403 a los demás (la vista pinta el aviso).
 */
export default function SupportAccessesSettingsPage() {
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
      <SupportAccessesView token={accessToken} />
    </SettingsPage>
  );
}

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsIndex } from '@/components/settings/settings-index';

const copy = {
  title: 'Ajustes',
  description: 'Cómo funciona la clínica: sedes, agenda, cobro, historia clínica y datos.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Índice de Ajustes (DX-282). Se llega desde «Ajustes» en el menú de cuenta;
 * cada rol ve solo las pantallas que puede abrir.
 */
export default function SettingsPage() {
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
      <SettingsIndex token={accessToken} />
    </>
  );
}

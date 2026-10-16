'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { PrivacyPolicySettings } from '@/components/data-consents/privacy-policy-settings';

const copy = {
  title: 'Privacidad de datos',
  description:
    'La política de tratamiento de datos (Ley 1581) que ven y autorizan los pacientes. Cada versión publicada queda fija.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Política de tratamiento de datos de la clínica (DX-037). Todos los roles la
 * leen; publicar una versión es solo de ADMIN (la API lo exige y la vista solo
 * le muestra el botón a ese rol).
 */
export default function PrivacySettingsPage() {
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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={copy.title} description={copy.description} />
      <PrivacyPolicySettings token={accessToken} />
    </div>
  );
}

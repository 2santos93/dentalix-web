'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { LocationRepsSettings } from '@/components/locations/location-reps-settings';
import { LocationPhoneSettings } from '@/components/locations/location-phone-settings';
import { CancellationPolicySettings } from '@/components/locations/cancellation-policy-settings';

const copy = {
  title: 'Sedes',
  description:
    'Datos legales de cada sede y su política de cancelación. El código de habilitación (REPS) lo pide el Resumen Digital de Atención en Colombia.',
  checkingSession: 'Verificando sesión…',
};

/**
 * DX-212: datos legales de las sedes (código REPS). Todos los roles lo leen
 * (el chip «RDA» de la ficha enlaza aquí); solo ADMIN lo cambia.
 */
export default function LocationSettingsPage() {
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
  const isAdmin = getTokenRole(accessToken) === 'ADMIN';

  return (
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      <LocationRepsSettings
        token={accessToken}
        canEdit={isAdmin}
      />
      <LocationPhoneSettings
        token={accessToken}
        canEdit={isAdmin}
      />
      {/* DX-279: solo ADMIN (la API responde 403 al resto). */}
      {isAdmin ? <CancellationPolicySettings token={accessToken} /> : null}
    </>
  );
}

'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { LocationsList } from '@/components/locations/locations-list';
import { LocationHealthRegistrationSettings } from '@/components/locations/location-health-registration-settings';
import { LocationPhoneSettings } from '@/components/locations/location-phone-settings';
import { CancellationPolicySettings } from '@/components/locations/cancellation-policy-settings';

const copy = {
  title: 'Sedes',
  // DX-279: la política de cancelación solo la ve ADMIN; al resto no se le anuncia.
  description: (isAdmin: boolean) =>
    isAdmin
      ? 'Moneda, zona horaria y formato de cada sede, sus datos legales y su política de cancelación.'
      : 'Moneda, zona horaria y formato de cada sede y sus datos legales.',
  checkingSession: 'Verificando sesión…',
};

/** `useSearchParams` exige un límite de Suspense (como Horarios). */
export default function LocationSettingsPage() {
  return (
    <Suspense fallback={null}>
      <LocationSettingsRoute />
    </Suspense>
  );
}

/**
 * Las sedes (G1: alta y edición con moneda, zona y formato; DX-319: nº de
 * registro sanitario; DX-222: teléfono). Todos los roles las leen; solo ADMIN
 * las cambia. `?sede=<id>` abre el modal de esa sede (enlace «Configurar
 * sede» de `SedeConfigError`).
 */
function LocationSettingsRoute() {
  const router = useRouter();
  const editId = useSearchParams().get('sede');
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
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description(isAdmin)} />
      <div className="flex flex-col gap-10">
        <LocationsList token={accessToken} canEdit={isAdmin} initialEditId={editId} />
        <LocationHealthRegistrationSettings
          token={accessToken}
          canEdit={isAdmin}
        />
        <LocationPhoneSettings
          token={accessToken}
          canEdit={isAdmin}
        />
        {/* DX-279: solo ADMIN (la API responde 403 al resto). */}
        {isAdmin ? <CancellationPolicySettings token={accessToken} /> : null}
      </div>
    </>
  );
}

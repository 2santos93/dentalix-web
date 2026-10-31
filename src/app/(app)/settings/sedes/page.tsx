'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { SettingsPage } from '@/components/settings/settings-page';
import { LocationsList } from '@/components/locations/locations-list';
import { RegionalReviewNotice } from '@/components/locations/regional-review-notice';

const copy = {
  title: 'Sedes',
  // DX-279: la política de cancelación solo la ve ADMIN; al resto no se le anuncia.
  description: (isAdmin: boolean) =>
    isAdmin
      ? 'Cada sede con su moneda, zona horaria y formato. Ábrela para sus datos legales y su política de cancelación.'
      : 'Cada sede con su moneda, zona horaria y formato. Ábrela para sus datos legales.',
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
 * Las sedes (G1: alta y edición con moneda, zona y formato). B6: esta página es
 * la LISTA; cada sede abre su ficha (`/settings/sedes/[id]`) con su registro
 * sanitario, su política de cancelación y su calendario — antes eran cuatro
 * secciones que repetían todas las sedes. Todos los roles las leen; solo ADMIN
 * las cambia. `?sede=<id>` abre el modal de esa sede (enlace «Configurar sede»
 * de `SedeConfigError`).
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
    <SettingsPage title={copy.title} description={copy.description(isAdmin)} scope="sede" width="wide">
      {/* Aviso D5 (solo ADMIN) pegado a la lista que lo resuelve. */}
      <div className="flex flex-col gap-4">
        <RegionalReviewNotice token={accessToken} showReviewLink={false} />
        <LocationsList
          token={accessToken}
          canEdit={isAdmin}
          initialEditId={editId}
          onInitialEditConsumed={() => router.replace('/settings/sedes')}
        />
      </div>
    </SettingsPage>
  );
}

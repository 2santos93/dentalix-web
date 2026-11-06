'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageEquipment } from '@/lib/equipment/equipment-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { SettingsPage } from '@/components/settings/settings-page';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { EquipmentManager } from '@/components/equipment/equipment-manager';

const copy = {
  title: 'Equipos biomédicos',
  description:
    'El inventario de equipos de cada sede, su hoja de vida y su programa de mantenimiento preventivo.',
  checkingSession: 'Verificando sesión…',
  locationsError: 'No pudimos cargar las sedes.',
  loading: 'Cargando sedes…',
};

/** Equipos biomédicos por sede (DX-542). Solo ADMIN los ve y los gestiona. */
export default function EquipmentSettingsPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="sede" width="wide">
      <EquipmentRoute token={accessToken} />
    </SettingsPage>
  );
}

function EquipmentRoute({ token }: { token: string }) {
  const state = useLocationsState(token);
  if (state.status === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-10 w-full sm:w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <SectionError description={copy.locationsError} onRetry={state.retry} />;
  }
  return (
    <EquipmentManager
      token={token}
      allowed={canManageEquipment(getTokenRole(token))}
      locations={state.locations.filter((l) => l.isActive)}
      initialLocationId={state.activeLocationId}
    />
  );
}

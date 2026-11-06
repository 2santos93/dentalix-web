'use client';
import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageEquipment } from '@/lib/equipment/equipment-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { SettingsPage } from '@/components/settings/settings-page';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { EquipmentDetailView } from '@/components/equipment/equipment-detail-view';
import { equipmentManagerCopy } from '@/components/equipment/equipment-manager';

const copy = {
  title: 'Hoja de vida del equipo',
  description: 'Los datos del equipo y todos sus mantenimientos, del más antiguo al más reciente.',
  back: { href: '/settings/equipos', label: 'Equipos biomédicos' },
  checkingSession: 'Verificando sesión…',
  locationsError: 'No pudimos cargar las sedes.',
  loading: 'Cargando sedes…',
};

/** La hoja de vida de un equipo biomédico (DX-542), solo ADMIN. */
export default function EquipmentLifeSheetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
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
    <SettingsPage title={copy.title} description={copy.description} scope="sede" width="wide" back={copy.back}>
      <LifeSheetRoute token={accessToken} equipmentId={params.id} />
    </SettingsPage>
  );
}

function LifeSheetRoute({ token, equipmentId }: { token: string; equipmentId: string }) {
  const state = useLocationsState(token);
  if (!canManageEquipment(getTokenRole(token))) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={equipmentManagerCopy.forbiddenTitle}
        description={equipmentManagerCopy.forbiddenHint}
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <SectionError description={copy.locationsError} onRetry={state.retry} />;
  }
  return (
    <EquipmentDetailView
      token={token}
      equipmentId={equipmentId}
      // DX-546 · FE-112: todas, también las desactivadas: un equipo de una
      // sede cerrada se mantiene con su «hoy» y su moneda.
      locations={state.locations}
    />
  );
}

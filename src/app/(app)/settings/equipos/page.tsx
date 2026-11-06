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
  scopeLocation: (name: string) => `Sede: ${name} (cámbiala en el selector de sede)`,
  scopeAll: 'Todas las sedes (elige una en el selector de sede)',
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

  return <EquipmentScreen token={accessToken} />;
}

/**
 * La sede la elige el selector global (como Gastos y Caja): la línea de
 * alcance dice cuál es, o que se ve toda la clínica.
 */
function EquipmentScreen({ token }: { token: string }) {
  const state = useLocationsState(token);
  const active =
    state.status === 'ready' && state.activeLocationId
      ? state.locations.find((l) => l.id === state.activeLocationId && l.isActive)
      : undefined;
  const scope = state.status === 'ready' ? (active ? copy.scopeLocation(active.name) : copy.scopeAll) : 'sede';
  return (
    <SettingsPage title={copy.title} description={copy.description} scope={scope} width="wide">
      {state.status === 'loading' ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-10 w-full sm:w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : state.status === 'error' ? (
        <SectionError description={copy.locationsError} onRetry={state.retry} />
      ) : (
        <EquipmentManager
          token={token}
          allowed={canManageEquipment(getTokenRole(token))}
          // DX-546 · FE-112: todas, también las desactivadas: un equipo de una
          // sede cerrada se mantiene con su «hoy» y su moneda.
          locations={state.locations}
          initialLocationId={active?.id ?? null}
        />
      )}
    </SettingsPage>
  );
}

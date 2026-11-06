'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { canManageRadiology, canReadRadiology } from '@/lib/radiology/radiology-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { RadiologyManager } from '@/components/radiology/radiology-manager';

const copy = {
  title: 'Rayos X: licencias y control de calidad',
  description:
    'La licencia de cada equipo de rayos X y su control de calidad, con su vencimiento: Inicio avisa 90 días antes.',
  checkingSession: 'Verificando sesión…',
  locationsError: 'No pudimos cargar las sedes.',
  loading: 'Cargando sedes…',
  scopeLocation: (name: string) => `Sede: ${name} (cámbiala en el selector de sede)`,
  scopeAll: 'Todas las sedes (elige una en el selector de sede)',
};

/** Expediente de rayos X por sede (DX-544). Leen DENTIST y ADMIN; escribe ADMIN. */
export default function RadiologySettingsPage() {
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

  return <RadiologyScreen token={accessToken} />;
}

/** La sede la elige el selector global (como Equipos biomédicos). */
function RadiologyScreen({ token }: { token: string }) {
  const state = useLocationsState(token);
  const role = getTokenRole(token);
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
        <RadiologyManager
          token={token}
          canRead={canReadRadiology(role)}
          canManage={canManageRadiology(role)}
          locations={state.locations}
          initialLocationId={active?.id ?? null}
        />
      )}
    </SettingsPage>
  );
}

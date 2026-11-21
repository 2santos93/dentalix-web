'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageWaitingRoomScreens } from '@/lib/waiting-room/waiting-room-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { SettingsPage } from '@/components/settings/settings-page';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { WaitingRoomScreensManager } from '@/components/waiting-room/waiting-room-screens-manager';

const copy = {
  title: 'Pantallas de sala de espera',
  description:
    'El televisor de la sala muestra quién espera y a quién llaman, con un enlace de solo lectura y sin datos de salud.',
  locationsError: 'No pudimos cargar las sedes.',
  loading: 'Cargando sedes…',
};

/** Pantallas de sala de espera por sede (DX-588). Solo ADMIN las gestiona. */
export default function WaitingRoomScreensSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="sede">
      <WaitingRoomScreensRoute token={accessToken} />
    </SettingsPage>
  );
}

function WaitingRoomScreensRoute({ token }: { token: string }) {
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
    <WaitingRoomScreensManager
      token={token}
      allowed={canManageWaitingRoomScreens(getTokenRole(token))}
      locations={state.locations.filter((l) => l.isActive)}
      initialLocationId={state.activeLocationId}
    />
  );
}

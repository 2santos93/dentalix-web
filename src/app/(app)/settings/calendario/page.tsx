'use client';
import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageLocationCalendar } from '@/lib/locations/location-calendar';
import { SettingsPage } from '@/components/settings/settings-page';
import { LocationCalendarView } from '@/components/location-calendar/location-calendar-view';

const copy = {
  title: 'Calendario de la sede',
  description:
    'Qué días cuentan como hábiles y qué días son festivos en cada sede. Lo usan los plazos que se cuentan en días hábiles.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Ajustes › Calendario de la sede (DX-316). Solo ADMIN: al resto se le enseña
 * el estado bloqueado sin llamar a la API, como en Mayoría de edad.
 * `?sede=<id>` (desde la ficha de la sede) elige la sede; sin él, la activa del
 * selector del shell. La vista dice cuál se edita.
 */
export default function LocationCalendarPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="sede">
      {/* `useSearchParams` (en la vista) exige un límite de Suspense. */}
      <Suspense fallback={null}>
        <LocationCalendarView
          token={accessToken}
          allowed={canManageLocationCalendar(getTokenRole(accessToken))}
        />
      </Suspense>
    </SettingsPage>
  );
}

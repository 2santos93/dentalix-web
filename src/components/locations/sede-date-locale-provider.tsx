'use client';
import type { ReactNode } from 'react';
import { DateLocaleProvider } from '@/components/ui/date-locale';
import { sedeClockFor } from '@/lib/locations/sede-clock';
import { useLocationsState } from '@/lib/locations/use-locations-state';

/**
 * El locale de los campos de fecha y hora de la app: el de la sede de la
 * pantalla (la activa; en «Todas las sedes», la principal), su reloj 12/24 h y
 * su zona — la misma regla que `useSedeClock`. Mientras las sedes cargan, o si
 * a la sede le falta el formato, los campos quedan en español (`es`), nunca en
 * el idioma del navegador. Sigue el cambio de sede.
 */
export function SedeDateLocaleProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const state = useLocationsState(token ?? '');
  const clock =
    state.status === 'ready' ? sedeClockFor(state.locations, state.activeLocationId) : null;
  const ready = clock?.status === 'ready' ? clock.clock : null;
  return (
    <DateLocaleProvider
      locale={ready?.fmt.locale}
      hourCycle={ready?.fmt.hourCycle}
      timeZone={ready?.timeZone}
    >
      {children}
    </DateLocaleProvider>
  );
}

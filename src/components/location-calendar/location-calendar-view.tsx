'use client';
import { useEffect, useId, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { getLocationCalendar, type LocationCalendar } from '@/lib/locations/location-calendar-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { NO_ACTIVE_LOCATION_ERROR } from '@/lib/locations/use-sede-time-zone';
import { SectionError } from '@/components/errors/section-error';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkingWeekdaysForm, workingWeekdaysCopy } from './working-weekdays-form';

export const locationCalendarCopy = {
  sede: 'Sede',
  inactive: 'inactiva',
  weekdaysHeading: 'Días hábiles',
  loadingLabel: 'Cargando',
  locationsError: 'No pudimos cargar las sedes.',
  loadError: 'No pudimos cargar el calendario de la sede.',
};

const copy = locationCalendarCopy;

// 44 px bajo `sm` (DESIGN.md, objetivo táctil de móvil).
const selectClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-11 sm:w-80';

/**
 * La sede de la pantalla: la de `?sede=` si existe; si no, la misma regla que
 * `pickSedeTimeZone` (la activa del selector del shell o, en «Todas las
 * sedes», la primera activa). Una clínica solo con sedes inactivas abre la
 * primera: su calendario también se puede consultar.
 */
export function pickCalendarLocation(
  locations: readonly ClinicLocation[],
  requestedId: string | null,
  activeLocationId: string | null,
): ClinicLocation | undefined {
  const byId = (id: string | null) => (id ? locations.find((l) => l.id === id) : undefined);
  return byId(requestedId) ?? byId(activeLocationId) ?? locations.find((l) => l.isActive) ?? locations[0];
}

function optionLabel(location: ClinicLocation): string {
  return location.isActive ? location.name : `${location.name} (${copy.inactive})`;
}

/**
 * Ajustes › Calendario de la sede (DX-316, spec §7.2): selector de sede y, de
 * la sede elegida, sus días hábiles y sus festivos. Solo ADMIN; al resto la
 * API le responde 403 y la pantalla enseña ese mensaje.
 */
export function LocationCalendarView({ token }: { token: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const requestedId = useSearchParams().get('sede');
  const state = useLocationsState(token);
  const selectId = useId();

  if (state.status === 'loading') return <LoadingBlock />;
  if (state.status === 'error') {
    return <SectionError description={copy.locationsError} onRetry={state.retry} />;
  }
  const location = pickCalendarLocation(state.locations, requestedId, state.activeLocationId);
  if (!location) {
    return <SectionError description={NO_ACTIVE_LOCATION_ERROR} onRetry={state.retry} />;
  }

  function choose(id: string) {
    router.replace(`${pathname}?sede=${encodeURIComponent(id)}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium text-ink">
          {copy.sede}
        </label>
        <select id={selectId} className={selectClass} value={location.id} onChange={(e) => choose(e.target.value)}>
          {state.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {optionLabel(l)}
            </option>
          ))}
        </select>
      </div>
      {/* Al cambiar de sede se monta de cero: nada de la anterior se queda en pantalla. */}
      <LocationCalendarSections key={location.id} token={token} location={location} onRetryLocations={state.retry} />
    </div>
  );
}

function LocationCalendarSections({
  token,
  location,
  onRetryLocations,
}: {
  token: string;
  location: ClinicLocation;
  onRetryLocations: () => void;
}) {
  const [calendar, setCalendar] = useState<LocationCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Las palabras de los días salen del formato de la sede ELEGIDA, no de la activa.
  const fmt = locationRegionalFormat(location);

  useEffect(() => {
    let cancelled = false;
    getLocationCalendar(token, location.id)
      .then((data) => {
        if (cancelled) return;
        setCalendar(data);
        setError(null);
      })
      .catch((err: unknown) => {
        // Un 403 trae el texto de la API («Solo un administrador…»), que gana al genérico.
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError, byStatus: { 404: copy.loadError } }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, location.id, reloadKey]);

  if (error) {
    return (
      <SectionError
        description={error}
        onRetry={() => {
          setError(null);
          setCalendar(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!calendar) return <LoadingBlock />;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="working-weekdays-heading" className="flex flex-col gap-3">
        <h2 id="working-weekdays-heading" className="text-lg font-semibold text-ink">
          {copy.weekdaysHeading}
        </h2>
        {fmt ? (
          <WorkingWeekdaysForm
            token={token}
            locationId={location.id}
            fmt={fmt}
            initial={calendar.workingWeekdays}
            onSaved={setCalendar}
          />
        ) : (
          <>
            <p data-testid="working-weekdays-summary" className="font-medium text-ink">
              {workingWeekdaysCopy.noSummary}
            </p>
            <SedeConfigError kind="locale" variant="note" locationId={location.id} onRetry={onRetryLocations} />
          </>
        )}
      </section>
      {/* Task 9: aquí va `HolidaysSection` con `calendar.holidays`. */}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div role="status" aria-label={copy.loadingLabel} className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full sm:w-80" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

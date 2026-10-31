'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { getLocationCalendar, type LocationCalendar } from '@/lib/locations/location-calendar-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { NO_ACTIVE_LOCATION_ERROR } from '@/lib/locations/use-sede-time-zone';
import { onLocationChange } from '@/lib/locations/location-store';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionHeader } from '@/components/ui/section-header';
import { HolidaysSection } from './holidays-section';
import { WorkingWeekdaysForm } from './working-weekdays-form';

export const locationCalendarCopy = {
  /** Qué sede se edita (plantilla de Ajustes, como Horarios). */
  editing: (name: string) => `Editando: ${name}`,
  inactive: 'inactiva',
  otherSede: 'Para otra sede, cámbiala en el selector de sede o ábrela desde',
  sedesLink: 'Sedes',
  weekdaysHeading: 'Días hábiles',
  loadingLabel: 'Cargando',
  locationsError: 'No pudimos cargar las sedes.',
  loadError: 'No pudimos cargar el calendario de la sede.',
  forbiddenTitle: 'Solo administración cambia el calendario de la sede.',
  forbiddenHint: 'Los plazos en días hábiles de cada sede ya cuentan con su calendario.',
  /** Sede sin formato (M3): dice qué falta y por qué «Importar» está deshabilitado. */
  noFormat:
    'No se pudo saber el formato regional de la sede, así que sus fechas no se muestran y no se pueden importar festivos. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
};

const copy = locationCalendarCopy;

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

function sedeLabel(location: ClinicLocation): string {
  return location.isActive ? location.name : `${location.name} (${copy.inactive})`;
}

/**
 * Ajustes › Calendario de la sede (DX-316, spec §7.2): de la sede que se
 * edita, sus días hábiles y sus festivos. La sede no se elige con un selector
 * propio (DESIGN.md → Settings pages → Per sede): es la de `?sede=` (la ficha
 * de la sede enlaza aquí) o la activa del selector del shell, y la pantalla
 * dice cuál es («Editando: Sede Norte»). Solo ADMIN: al resto se le
 * dice sin pedir nada a la API, como en Mayoría de edad (`allowed` sale del
 * rol del token); si el rol del token está viejo, el 403 de la API se enseña
 * en la sección.
 */
export function LocationCalendarView({ token, allowed }: { token: string; allowed: boolean }) {
  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
  return <AllowedLocationCalendarView token={token} />;
}

function AllowedLocationCalendarView({ token }: { token: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const requestedId = useSearchParams().get('sede');
  const state = useLocationsState(token);
  const location =
    state.status === 'ready' ? pickCalendarLocation(state.locations, requestedId, state.activeLocationId) : undefined;

  // Un `?sede=` que no es de esta clínica (o ya no existe) abre la sede por
  // defecto, y la URL pasa a decir cuál es: un enlace viejo no aparenta abrir
  // la sede que pedía.
  useEffect(() => {
    if (requestedId && location && requestedId !== location.id) {
      router.replace(`${pathname}?sede=${encodeURIComponent(location.id)}`, { scroll: false });
    }
  }, [requestedId, location, router, pathname]);

  // Cambiar la sede en el selector del shell manda: un `?sede=` (de la ficha de
  // una sede) deja de fijarla y la pantalla pasa a la sede activa.
  useEffect(
    () =>
      onLocationChange(() => {
        // El selector del shell recarga la página justo después: la URL se
        // corrige ya (síncrono) para que la recarga no vuelva a la sede fijada.
        window.history.replaceState(window.history.state, '', pathname);
        router.replace(pathname, { scroll: false });
      }),
    [router, pathname],
  );

  if (state.status === 'loading') return <LoadingBlock />;
  if (state.status === 'error') {
    return <SectionError description={copy.locationsError} onRetry={state.retry} />;
  }
  if (!location) {
    return <SectionError description={NO_ACTIVE_LOCATION_ERROR} onRetry={state.retry} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 text-sm text-muted">
        <p data-testid="calendar-sede" className="font-medium text-ink">
          {copy.editing(sedeLabel(location))}
        </p>
        <p>
          {copy.otherSede}{' '}
          <Link
            href="/settings/sedes"
            className="font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
          >
            {copy.sedesLink}
          </Link>
          .
        </p>
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
  // Las fechas salen del formato de la sede ELEGIDA, no de la activa.
  const fmt = locationRegionalFormat(location);
  const noFormatNoteId = useId();

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
      {/* Una sola nota para toda la pantalla: sin formato, los festivos pintan «—» (R11) e «Importar» se deshabilita (M3). */}
      {fmt ? null : (
        <SedeConfigError
          kind="locale"
          variant="note"
          description={copy.noFormat}
          descriptionId={noFormatNoteId}
          locationId={location.id}
          onRetry={onRetryLocations}
        />
      )}
      <section aria-labelledby="working-weekdays-heading" className="flex flex-col gap-3">
        <SectionHeader title={copy.weekdaysHeading} titleId="working-weekdays-heading" />
        {/* Los nombres de los días no dependen del formato de la sede: el formulario va siempre (M3). */}
        <WorkingWeekdaysForm
          token={token}
          locationId={location.id}
          initial={calendar.workingWeekdays}
          locale={location.locale}
          // Solo los días: los festivos de la pantalla pueden ser más nuevos que la respuesta del PUT.
          onSaved={(saved) => setCalendar((c) => (c ? { ...c, workingWeekdays: saved.workingWeekdays } : saved))}
        />
      </section>
      {/* Sin formato pinta «—» en las fechas y ninguna nota propia: ya está la de arriba. */}
      <HolidaysSection
        token={token}
        location={location}
        noFormatNoteId={noFormatNoteId}
        holidays={calendar.holidays}
        onChanged={(update) => setCalendar((c) => (c ? { ...c, holidays: update(c.holidays) } : c))}
      />
    </div>
  );
}

function LoadingBlock() {
  return (
    <div role="status" aria-label={copy.loadingLabel} className="flex flex-col gap-3">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

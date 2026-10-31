'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { announceAppointmentWarnings } from '@/components/appointments/appointment-warnings';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/client';
import {
  findOpenings,
  scheduleFromWaitlist,
  type AppointmentWrite,
  type Opening,
  type WaitlistEntry,
} from '@/lib/appointments/waitlist-api';
import { groupOpeningsByDay } from '@/lib/appointments/waitlist-display';
import type { StaffMember } from '@/lib/appointments/staff-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { isCivilDay } from '@/lib/time/civil-day';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, sedeTimeRange, type SedeClock } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { addCivilDays, wallDay } from '@/lib/time/wall-clock';
import { endSentence } from '@/lib/format/text';

// Copy as constants (i18n-ready, es-first).
const copy = {
  title: (name: string) => `Buscar hueco para ${name}`,
  description: (minutes: number) =>
    `Huecos de ${minutes} min dentro del horario de la sede y del profesional en ella, sin chocar con otras citas y fuera de cualquier bloqueo (también los que dejan agendar, como el almuerzo).`,
  provider: 'Profesional',
  from: 'Desde',
  to: 'Hasta',
  search: 'Buscar',
  results: 'Huecos libres',
  loading: 'Buscando huecos…',
  empty: 'No hay huecos libres en estas fechas',
  emptyHint: 'Prueba con otro profesional o amplía las fechas.',
  loadError: 'No pudimos buscar huecos.',
  retry: 'Reintentar',
  truncated: 'Hay más huecos: acota las fechas para verlos todos.',
  bookHere: 'Agendar aquí',
  bookHereAt: (when: string) => `Agendar aquí el ${when}`,
  scheduled: (name: string, when: string) => endSentence(`Cita agendada: ${name}, ${when}`),
  scheduleError: 'No pudimos agendar la cita. Intenta de nuevo.',
  entryGone: (name: string) =>
    `${name} ya no está en pendientes: alguien lo agendó o lo descartó.`,
  pickProvider: 'Elige un profesional.',
};

/** Días que se buscan por defecto: dos semanas. */
const DEFAULT_SPAN_DAYS = 13;

function dayLabel(day: string): string {
  return civilDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function waitlistPatientName(entry: WaitlistEntry): string {
  return `${entry.patientFirstName} ${entry.patientLastName}`.trim();
}

interface OpeningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  entry: WaitlistEntry;
  /** DX-378: reloj de la sede de la entrada: sus días y sus horas. */
  clock: SedeClock;
  /** Profesionales que se pueden elegir (odontólogos y ADMIN primero). */
  providers: StaffMember[];
  onScheduled: (appointment: AppointmentWrite) => void;
  /** La entrada ya no está abierta (otra persona la agendó o descartó). */
  onEntryGone: () => void;
  /** Ver `FormModal.onCloseAutoFocus`. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** 409 de «Agendar aquí» porque la entrada ya no está OPEN (no por el hueco). */
function isEntryGone(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    apiErrorMessage(err).includes('ya no está en pendientes')
  );
}

/**
 * «Buscar hueco» y «Agendar aquí» (DX-122): huecos del profesional en la sede
 * de la entrada; un clic crea la cita (con todas las reglas de la API) y saca
 * al paciente de la lista. Estados de carga, vacío y error con Reintentar.
 */
export function OpeningsDialog({
  open,
  onOpenChange,
  token,
  entry,
  clock,
  providers,
  onScheduled,
  onEntryGone,
  onCloseAutoFocus,
}: OpeningsDialogProps) {
  const [today] = useState(() => sedeToday(clock.timeZone));
  const [providerId, setProviderId] = useState(entry.providerId ?? providers[0]?.userId ?? '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => addCivilDays(today, DEFAULT_SPAN_DAYS));
  // Lo que se busca: cambia al pulsar «Buscar» (no en cada tecla).
  const [query, setQuery] = useState({ providerId, from, to });
  const [reloadKey, setReloadKey] = useState(0);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookingStart, setBookingStart] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const name = waitlistPatientName(entry);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!query.providerId) {
        setLoading(false);
        setLoadError(copy.pickProvider);
        return;
      }
      setLoading(true);
      try {
        const result = await findOpenings(token, {
          providerId: query.providerId,
          locationId: entry.locationId,
          from: query.from,
          to: query.to,
          durationMinutes: entry.durationMinutes,
          patientId: entry.patientId,
        });
        if (cancelled) return;
        setOpenings(result.openings);
        setTruncated(result.truncated);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, entry, query, reloadKey]);

  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBookError(null);
    // Una fecha escrita a medias no se busca: se queda la búsqueda anterior.
    if (!isCivilDay(from) || !isCivilDay(to)) return;
    setQuery({ providerId, from, to });
  }

  async function book(opening: Opening) {
    setBookError(null);
    setBookingStart(opening.start);
    try {
      const created = await scheduleFromWaitlist(token, entry.id, {
        providerId: query.providerId,
        start: opening.start,
      });
      const when = `${civilDateLabel(wallDay(created.start, clock.timeZone), { weekday: 'short', day: 'numeric', month: 'short' })} ${sedeTimeRange(created.start, created.end, clock)}`;
      toast.success(copy.scheduled(name, when));
      announceAppointmentWarnings(created);
      onScheduled(created);
    } catch (err) {
      if (isEntryGone(err)) {
        toast.info(copy.entryGone(name));
        onEntryGone();
        return;
      }
      setBookError(apiErrorMessage(err, copy.scheduleError));
      // El hueco se ocupó o se bloqueó entretanto: se vuelve a buscar.
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        setReloadKey((k) => k + 1);
      }
    } finally {
      setBookingStart(null);
    }
  }

  const groups = groupOpeningsByDay(openings, clock.timeZone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{copy.title(name)}</DialogTitle>
          <DialogDescription>{copy.description(entry.durationMinutes)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={search} noValidate className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <FormField htmlFor="openings-provider" label={copy.provider}>
            <NativeSelect
              id="openings-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="openings-from" label={copy.from}>
            <DatePicker
              id="openings-from"
              min={today}
              value={from || null}
              onChange={(next) => {
                setFrom(next ?? '');
                if (next && isCivilDay(next) && next > to) setTo(next);
              }}
            />
          </FormField>
          <FormField htmlFor="openings-to" label={copy.to}>
            <DatePicker
              id="openings-to"
              min={isCivilDay(from) ? from : undefined}
              value={to || null}
              onChange={(next) => setTo(next ?? '')}
            />
          </FormField>
          <Button type="submit" variant="secondary">
            {copy.search}
          </Button>
        </form>

        {bookError ? <InlineError variant="summary">{bookError}</InlineError> : null}

        <section aria-label={copy.results} className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
          {loading ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">{copy.loading}</span>
              <Skeleton className="h-5 w-40" aria-hidden />
              <Skeleton className="h-11 w-full" aria-hidden />
              <Skeleton className="h-11 w-full" aria-hidden />
            </div>
          ) : loadError ? (
            <SectionError
              description={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              retryLabel={copy.retry}
              className="py-10"
            />
          ) : groups.length === 0 ? (
            <EmptyState role="status" title={copy.empty} description={copy.emptyHint} />
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.day} className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-semibold text-muted first-letter:uppercase">{dayLabel(group.day)}</h3>
                  <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border bg-surface">
                    {group.openings.map((opening) => (
                      <li
                        key={opening.start}
                        data-testid="opening"
                        className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5"
                      >
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {sedeTimeRange(opening.start, opening.end, clock)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          loading={bookingStart === opening.start}
                          disabled={bookingStart !== null}
                          aria-label={copy.bookHereAt(`${dayLabel(group.day)} a las ${sedeTime(opening.start, clock)}`)}
                          onClick={() => void book(opening)}
                        >
                          {copy.bookHere}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {truncated ? <p className="text-xs text-muted">{copy.truncated}</p> : null}
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

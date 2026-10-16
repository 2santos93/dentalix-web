'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  findOpenings,
  scheduleFromWaitlist,
  type AppointmentWrite,
  type Opening,
  type WaitlistEntry,
} from '@/lib/appointments/waitlist-api';
import { groupOpeningsByDay } from '@/lib/appointments/waitlist-display';
import type { StaffMember } from '@/lib/appointments/staff-api';
import { formatTimeRange } from '@/components/appointments/appointment-display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { formatDateLabel } from '@/lib/format/date';

// Copy as constants (i18n-ready, es-first).
const copy = {
  title: (name: string) => `Buscar hueco para ${name}`,
  description: (minutes: number) =>
    `Huecos de ${minutes} min dentro del horario de la sede, fuera de bloqueos y sin chocar con otras citas.`,
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
  scheduled: (name: string, when: string) => `Cita agendada: ${name}, ${when}.`,
  scheduleError: 'No pudimos agendar la cita. Intenta de nuevo.',
  pickProvider: 'Elige un profesional.',
};

/** Días que se buscan por defecto: dos semanas. */
const DEFAULT_SPAN_DAYS = 13;

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(day: string): string {
  return formatDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function waitlistPatientName(entry: WaitlistEntry): string {
  return `${entry.patientFirstName} ${entry.patientLastName}`.trim();
}

interface OpeningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  entry: WaitlistEntry;
  /** Profesionales que se pueden elegir (odontólogos y ADMIN primero). */
  providers: StaffMember[];
  onScheduled: (appointment: AppointmentWrite) => void;
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
  providers,
  onScheduled,
}: OpeningsDialogProps) {
  const [today] = useState(() => localDay(new Date()));
  const [providerId, setProviderId] = useState(entry.providerId ?? providers[0]?.userId ?? '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => addDays(today, DEFAULT_SPAN_DAYS));
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
      const when = `${formatDateLabel(created.start, { weekday: 'short', day: 'numeric', month: 'short' })} ${formatTimeRange(created.start, created.end)}`;
      toast.success(copy.scheduled(name, when));
      for (const warning of created.warnings) toast.warning(warning);
      onScheduled(created);
    } catch (err) {
      setBookError(apiErrorMessage(err, copy.scheduleError));
    } finally {
      setBookingStart(null);
    }
  }

  const groups = groupOpeningsByDay(openings);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title(name)}</DialogTitle>
          <DialogDescription>{copy.description(entry.durationMinutes)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={search} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <FormField htmlFor="openings-provider" label={copy.provider}>
            <select
              id="openings-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {providers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor="openings-from" label={copy.from}>
            <Input
              id="openings-from"
              type="date"
              min={today}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > to) setTo(e.target.value);
              }}
            />
          </FormField>
          <FormField htmlFor="openings-to" label={copy.to}>
            <Input id="openings-to" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
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
                  <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
                    {group.openings.map((opening) => (
                      <li
                        key={opening.start}
                        data-testid="opening"
                        className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5"
                      >
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {hhmm(opening.start)}–{hhmm(opening.end)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          loading={bookingStart === opening.start}
                          disabled={bookingStart !== null}
                          aria-label={copy.bookHereAt(`${dayLabel(group.day)} a las ${hhmm(opening.start)}`)}
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

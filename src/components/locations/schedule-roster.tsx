'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getRoster, type Roster } from '@/lib/locations/provider-schedule-api';
import { addDaysIso, mondayOf, rosterCell } from '@/lib/locations/provider-schedule';
import { civilDateLabel } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

const copy = {
  prevWeek: 'Semana anterior',
  nextWeek: 'Semana siguiente',
  thisWeek: 'Esta semana',
  provider: 'Profesional',
  loadError: 'No pudimos cargar el cuadrante.',
  retry: 'Reintentar',
  empty: 'No hay profesionales que atiendan pacientes',
  override: 'Excepción',
  legend:
    'Cada día, la sede y los tramos en que atiende. «Excepción» = un horario distinto para esa fecha; «Sin horario» = se le puede citar en cualquier horario de la sede.',
};

function weekLabel(from: string, to: string): string {
  const sameMonth = from.slice(5, 7) === to.slice(5, 7);
  const start = civilDateLabel(from, { day: 'numeric', ...(sameMonth ? {} : { month: 'short' }) });
  const end = civilDateLabel(to, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${start} – ${end}`;
}

function dayHeader(date: string): string {
  return civilDateLabel(date, { weekday: 'short', day: 'numeric' });
}

function dayLong(date: string): string {
  return civilDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

interface ScheduleRosterProps {
  token: string;
  /** Hoy (`YYYY-MM-DD` local): decide la semana inicial y resalta el día. */
  today: string;
}

/**
 * Cuadrante semanal (DX-233): cada profesional que atiende × día, con la sede
 * y los tramos de ese día. A 390 px, una tarjeta por profesional con los días
 * en filas; desde `lg`, una tabla de 8 columnas sin scroll horizontal.
 */
export function ScheduleRoster({ token, today }: ScheduleRosterProps) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRoster(null);
      setError(null);
      try {
        const r = await getRoster(token, { weekStart });
        if (!cancelled) setRoster(r);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, weekStart, reloadKey]);

  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const names = Object.fromEntries((roster?.locations ?? []).map((l) => [l.id, l.name]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" aria-label={copy.prevWeek} onClick={() => setWeekStart((w) => addDaysIso(w, -7))}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="sm" aria-label={copy.nextWeek} onClick={() => setWeekStart((w) => addDaysIso(w, 7))}>
            <ChevronRight />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(today))}>
            {copy.thisWeek}
          </Button>
        </div>
        <p className="text-sm font-semibold tabular-nums text-ink" aria-live="polite">
          {weekLabel(dates[0], dates[6])}
        </p>
      </div>
      <p className="max-w-prose text-sm text-muted">{copy.legend}</p>

      {error ? (
        <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} retryLabel={copy.retry} />
      ) : !roster ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : roster.providers.length === 0 ? (
        <EmptyState role="status" title={copy.empty} />
      ) : (
        <div className="flex flex-col gap-3 lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border lg:bg-surface">
          <div
            aria-hidden
            className="hidden border-b border-border bg-surface-2 lg:grid lg:grid-cols-[11rem_repeat(7,minmax(0,1fr))]"
          >
            <span className="px-3 py-2.5 text-xs font-medium text-muted">{copy.provider}</span>
            {dates.map((d) => (
              <span
                key={d}
                className={cn(
                  'border-l border-border px-3 py-2.5 text-xs font-medium tabular-nums text-muted first-letter:uppercase',
                  d === today && 'text-primary',
                )}
              >
                {dayHeader(d)}
              </span>
            ))}
          </div>
          {roster.providers.map((p) => (
            <section
              key={p.providerId}
              aria-label={p.fullName}
              className="overflow-hidden rounded-xl border border-border bg-surface lg:grid lg:grid-cols-[11rem_repeat(7,minmax(0,1fr))] lg:rounded-none lg:border-0 lg:border-b lg:border-hairline lg:last:border-b-0"
            >
              <h4 className="border-b border-hairline bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink lg:border-b-0 lg:bg-transparent lg:px-3 lg:py-3">
                {p.fullName}
              </h4>
              {dates.map((date) => {
                const day = p.days.find((d) => d.date === date);
                const entries = day ? rosterCell(day, names) : [];
                return (
                  <div
                    key={date}
                    role="group"
                    aria-label={dayLong(date)}
                    className={cn(
                      'flex items-start justify-between gap-3 border-b border-hairline px-4 py-2 last:border-b-0 lg:flex-col lg:justify-start lg:gap-1 lg:border-b-0 lg:border-l lg:border-border lg:px-3 lg:py-3',
                      date === today && 'bg-primary/5',
                    )}
                  >
                    <span className="shrink-0 text-sm tabular-nums text-muted first-letter:uppercase lg:sr-only">
                      {dayHeader(date)}
                    </span>
                    <span className="flex min-w-0 flex-col items-end gap-1 text-right lg:items-start lg:text-left">
                      {entries.map((e, i) =>
                        e.kind === 'unrestricted' || e.kind === 'off' ? (
                          <span key={i} className="text-xs text-muted">
                            {e.text}
                          </span>
                        ) : (
                          <span key={i} className="flex min-w-0 flex-col items-end lg:items-start">
                            <span className="max-w-full truncate text-xs font-medium text-ink">{e.location}</span>
                            <span
                              className={cn(
                                'text-xs tabular-nums',
                                e.kind === 'override-off' ? 'text-warning' : 'text-ink',
                              )}
                            >
                              {e.text}
                            </span>
                            {e.override ? (
                              <span className="mt-0.5 rounded-full bg-warning/10 px-1.5 text-[0.6875rem] font-medium text-warning">
                                {copy.override}
                              </span>
                            ) : null}
                          </span>
                        ),
                      )}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

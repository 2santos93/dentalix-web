'use client';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { isRejection } from '@/lib/api/api-error';
import {
  createAppointmentSeries,
  previewAppointmentSeries,
  seriesConflictsOf,
  SERIES_COUNT_MIN,
  type CreatedAppointmentSeries,
  type SeriesConflictReason,
  type SeriesPreview,
  type SeriesPreviewInput,
  type SeriesPreviewOccurrence,
} from '@/lib/appointments/appointment-series-api';
import { formatMinute, minuteOfDay } from '@/lib/appointments/day-grid';
import { timeToMinutes } from '@/lib/locations/schedule-api';
import type { SedeClock } from '@/lib/locations/sede-clock';
import { wallDay, wallInstant } from '@/lib/time/wall-clock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { TimeField } from '@/components/ui/date-field';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';

export const seriesPreviewCopy = {
  title: 'Fechas de la serie',
  loading: 'Revisando las fechas…',
  loadError: 'No pudimos revisar las fechas',
  back: 'Volver',
  count: (n: number) => (n === 1 ? '1 cita' : `${n} citas`),
  pending: (n: number) =>
    n === 1 ? 'Queda 1 fecha que choca: elige otra hora u omítela.' : `Quedan ${n} fechas que chocan: elige otra hora u omítelas.`,
  tooFew: `Una serie necesita al menos ${SERIES_COUNT_MIN} citas.`,
  free: 'Libre',
  conflict: 'Choca',
  skipped: 'Omitida',
  changed: 'Otra hora',
  useAlternative: (time: string) => `Usar ${time}`,
  otherTime: 'Elegir otra hora',
  otherTimeLabel: (day: string) => `Otra hora para el ${day}`,
  skip: 'Omitir',
  undo: 'Deshacer',
  willUse: (time: string) => `Se agenda a las ${time}.`,
  noAlternative: 'No queda otro hueco libre ese día.',
  stillTaken: (time: string) => `La hora elegida (${time}) ya no estaba libre:`,
  notify: 'Avisar al paciente por email',
  notifyHint: 'Un solo email con todas las fechas. Los recordatorios de cada cita salen como siempre.',
  submit: (n: number) => (n === 1 ? 'Crear 1 cita' : `Crear ${n} citas`),
  submitting: 'Creando…',
  genericError: 'No pudimos crear la serie. Intenta de nuevo.',
  invalidTime: 'Escribe una hora válida.',
};

const copy = seriesPreviewCopy;

/** Qué se hace con cada fecha de la propuesta. */
type Choice =
  | { kind: 'proposed' }
  | { kind: 'alternative' }
  | { kind: 'custom'; time: string }
  | { kind: 'skip' };

/** La hora enviada que el servidor rechazó en un 409 (para decirlo en su fila). */
interface Rejected {
  start: string;
  reasons: readonly SeriesConflictReason[];
}

interface SeriesPreviewStepProps {
  token: string;
  locationId?: string;
  /** Cita base + recurrencia, ya validada en el paso 1. */
  request: SeriesPreviewInput;
  /** Reloj de la sede de la cita: pinta fechas y horas y compone «Elegir otra hora». */
  clock: SedeClock;
  onBack: () => void;
  onCreated: (result: CreatedAppointmentSeries) => void;
}

/** Inicio que se enviará para una fecha (o `null` si se omite o la hora no vale). */
function chosenStart(o: SeriesPreviewOccurrence, choice: Choice, timeZone: string): string | null {
  switch (choice.kind) {
    case 'skip':
      return null;
    case 'alternative':
      return o.alternative?.start ?? null;
    case 'custom': {
      const minute = timeToMinutes(choice.time);
      return minute === null ? null : wallInstant(wallDay(o.start, timeZone), minute, timeZone).toISOString();
    }
    default:
      return o.start;
  }
}

/** Choca y nadie decidió qué hacer: no deja crear. */
function isUnresolved(o: SeriesPreviewOccurrence, choice: Choice): boolean {
  if (choice.kind === 'proposed') return o.status === 'CONFLICT';
  if (choice.kind === 'custom') return timeToMinutes(choice.time) === null;
  return false;
}

/**
 * DX-562 (D7), paso 2 de «Repetir»: la vista previa de la serie en el mismo
 * diálogo. Cada fecha con su hora (zona de la sede) y su estado; las que chocan
 * dicen por qué (texto de la API) y se resuelven con la alternativa del mismo
 * día, otra hora o «Omitir». «Crear N citas» solo sin choques pendientes; un
 * 409 al crear vuelve a revisar las fechas y marca las que ya no estaban libres.
 */
export function SeriesPreviewStep({ token, locationId, request, clock, onBack, onCreated }: SeriesPreviewStepProps) {
  const { timeZone, fmt } = clock;
  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; retry: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [rejected, setRejected] = useState<Record<number, Rejected>>({});
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    () => (locationId ? previewAppointmentSeries(token, request, locationId) : previewAppointmentSeries(token, request)),
    [token, request, locationId],
  );

  useEffect(() => {
    let cancelled = false;
    load().then(
      (res) => {
        if (cancelled) return;
        setPreview(res);
      },
      (err: unknown) => {
        if (cancelled) return;
        setLoadError({ message: apiErrorMessage(err, copy.loadError), retry: !isRejection(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, reloadKey]);

  // Al llegar la lista, el foco va a su título (teclado y lector de pantalla).
  const loaded = preview !== null;
  useEffect(() => {
    if (loaded) headingRef.current?.focus();
  }, [loaded]);

  const tz = preview?.timeZone ?? timeZone;
  const occurrences = preview?.occurrences ?? [];
  const choiceOf = (o: SeriesPreviewOccurrence): Choice => choices[o.index] ?? { kind: 'proposed' };
  const kept = occurrences.filter((o) => choiceOf(o).kind !== 'skip');
  const unresolved = occurrences.filter((o) => isUnresolved(o, choiceOf(o))).length;
  const canCreate = preview !== null && unresolved === 0 && kept.length >= SERIES_COUNT_MIN && !submitting;

  function choose(index: number, choice: Choice) {
    setChoices((c) => ({ ...c, [index]: choice }));
    setError(null);
  }

  async function handleCreate() {
    if (!preview || !canCreate) return;
    const starts = kept.flatMap((o) => {
      const start = chosenStart(o, choiceOf(o), tz);
      return start ? [{ start }] : [];
    });
    if (starts.length !== kept.length) {
      setError(copy.invalidTime);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = { ...request, occurrences: starts, notifyPatient };
      const created = await (locationId
        ? createAppointmentSeries(token, input, locationId)
        : createAppointmentSeries(token, input));
      onCreated(created);
    } catch (err) {
      const conflicts = seriesConflictsOf(err);
      setError(apiErrorMessage(err, copy.genericError));
      if (conflicts !== null) {
        // Vuelve a revisar las fechas: las que chocaron pierden su elección y
        // dicen por qué; las demás conservan la suya.
        const marks: Record<number, Rejected> = {};
        for (const c of conflicts) marks[c.index] = { start: c.start, reasons: c.reasons };
        setRejected(marks);
        setChoices((prev) => {
          const next = { ...prev };
          for (const c of conflicts) delete next[c.index];
          return next;
        });
        try {
          setPreview(await load());
        } catch {
          // La lista anterior sigue en pantalla con las marcas del 409.
        }
        headingRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        {loadError.retry ? (
          <SectionError
            title={copy.loadError}
            description={loadError.message}
            onRetry={() => {
              setLoadError(null);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : (
          <InlineError variant="summary">{loadError.message}</InlineError>
        )}
        <Button type="button" variant="secondary" className="self-start" onClick={onBack}>
          <ArrowLeft aria-hidden /> {copy.back}
        </Button>
      </div>
    );
  }

  if (!preview) {
    return (
      <p role="status" className="py-6 text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="series-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
          {copy.title}
        </h3>
        <p role="status" className="text-sm tabular-nums text-muted" data-testid="series-count">
          {copy.count(kept.length)}
        </p>
      </div>

      <ol className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
        {occurrences.map((o) => (
          <OccurrenceRow
            key={o.index}
            occurrence={o}
            choice={choiceOf(o)}
            rejected={rejected[o.index] ?? null}
            timeZone={tz}
            fmt={fmt}
            disabled={submitting}
            onChoose={(choice) => choose(o.index, choice)}
          />
        ))}
      </ol>

      {unresolved > 0 ? (
        <Callout tone="warning" role="status" data-testid="series-pending">
          {copy.pending(unresolved)}
        </Callout>
      ) : kept.length < SERIES_COUNT_MIN ? (
        <Callout tone="warning" role="status">
          {copy.tooFew}
        </Callout>
      ) : null}

      <Checkbox
        id="series-notify-patient"
        checked={notifyPatient}
        disabled={submitting}
        onChange={(e) => setNotifyPatient(e.target.checked)}
        label={copy.notify}
        description={copy.notifyHint}
      />

      {error ? <InlineError variant="summary">{error}</InlineError> : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onBack}>
          <ArrowLeft aria-hidden /> {copy.back}
        </Button>
        <Button type="button" loading={submitting} disabled={!canCreate} onClick={() => void handleCreate()}>
          {submitting ? copy.submitting : copy.submit(kept.length)}
        </Button>
      </div>
    </div>
  );
}

function OccurrenceRow({
  occurrence: o,
  choice,
  rejected,
  timeZone,
  fmt,
  disabled,
  onChoose,
}: {
  occurrence: SeriesPreviewOccurrence;
  choice: Choice;
  rejected: Rejected | null;
  timeZone: string;
  fmt: SedeClock['fmt'];
  disabled: boolean;
  onChoose: (choice: Choice) => void;
}) {
  const timeFieldId = `series-time-${o.index}`;
  const day = fmt.longDate(new Date(o.start), timeZone, { weekday: true });
  const time = fmt.time(new Date(o.start), timeZone);
  const conflict = o.status === 'CONFLICT';
  const alternativeTime = o.alternative ? fmt.time(new Date(o.alternative.start), timeZone) : null;
  const status =
    choice.kind === 'skip'
      ? { label: copy.skipped, variant: 'neutral' as const }
      : choice.kind === 'alternative' || choice.kind === 'custom'
        ? { label: copy.changed, variant: 'info' as const }
        : conflict
          ? { label: copy.conflict, variant: 'danger' as const }
          : { label: copy.free, variant: 'success' as const };
  // Lo que se pintó al rechazar el servidor esa hora (si no era la propuesta).
  const showRejected = rejected !== null && rejected.start !== o.start && choice.kind === 'proposed';

  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:px-4" data-testid={`series-occurrence-${o.index}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={choice.kind === 'skip' ? 'text-sm text-muted line-through' : 'text-sm text-ink'}>
          <span className="tabular-nums text-muted">{o.index}.</span>{' '}
          <span className="font-medium">{day}</span>, <time dateTime={o.start} className="tabular-nums">{time}</time>
        </p>
        <Badge variant={status.variant} dot>
          {status.label}
        </Badge>
      </div>

      {showRejected ? (
        <div className="text-sm text-danger-text">
          <p>{copy.stillTaken(fmt.time(new Date(rejected.start), timeZone))}</p>
          <ReasonList reasons={rejected.reasons} />
        </div>
      ) : null}

      {conflict && choice.kind !== 'skip' ? <ReasonList reasons={o.reasons} /> : null}

      {conflict && choice.kind === 'alternative' && alternativeTime ? (
        <p className="text-sm text-ink">{copy.willUse(alternativeTime)}</p>
      ) : null}

      {choice.kind === 'custom' ? (
        <TimeField
          id={timeFieldId}
          label={copy.otherTimeLabel(day)}
          value={choice.time || null}
          disabled={disabled}
          onChange={(next) => onChoose({ kind: 'custom', time: next ?? '' })}
          className="sm:max-w-64"
        />
      ) : null}

      {conflict && choice.kind === 'proposed' && !o.alternative ? (
        <p className="text-xs text-muted">{copy.noAlternative}</p>
      ) : null}

      {conflict || choice.kind !== 'proposed' ? (
        <div className="flex flex-wrap gap-2">
          {choice.kind === 'proposed' ? (
            <>
              {alternativeTime ? (
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChoose({ kind: 'alternative' })}>
                  {copy.useAlternative(alternativeTime)}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChoose({ kind: 'custom', time: formatMinute(minuteOfDay(o.start, timeZone)) })}
              >
                {copy.otherTime}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChoose({ kind: 'skip' })}>
                {copy.skip}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChoose({ kind: 'proposed' })}>
              {copy.undo}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ReasonList({ reasons }: { reasons: readonly SeriesConflictReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-danger-text">
      {reasons.map((r) => (
        <li key={`${r.code}-${r.message}`}>{r.message}</li>
      ))}
    </ul>
  );
}

'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { updateAppointment, type Appointment } from '@/lib/appointments/appointments-api';
import type { StaffMember } from '@/lib/appointments/staff-api';
import {
  describeDay,
  fitsBusinessHoursLocal,
  timeToMinutes,
  type BusinessHours,
} from '@/lib/locations/schedule-api';
import { formatMinute, minuteOfDay, moveTarget, type MoveTarget } from '@/lib/appointments/day-grid';
import { canOfferNextOpening, findNextOpening, NEXT_OPENING_DAYS } from '@/lib/appointments/next-opening';
import { Callout } from '@/components/ui/callout';
import { Button } from '@/components/ui/button';
import { sedeMinute, type SedeClock } from '@/lib/locations/sede-clock';
import { civilWeekday } from '@/lib/time/civil-day';
import { wallDay } from '@/lib/time/wall-clock';
import { patientLabel } from '@/components/appointments/appointment-display';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { TimeField } from '@/components/ui/date-field';
import { NativeSelect } from '@/components/ui/native-select';
import { isCivilDay } from '@/lib/time/civil-day';
import type { Chair } from '@/lib/chairs/chairs-api';
import { chairDisplayName, offeredProvider } from '@/lib/chairs/chair-columns';
import { endSentence } from '@/lib/format/text';
import { defaultHoursNote } from '@/lib/locations/default-business-hours';
import { HolidayNotice, holidayClosedMessage, useHolidayOnDay } from './holiday-notice';
import { isInClinic } from '@/lib/appointments/patient-flow';
import {
  isPendingSeriesStatus,
  isSeriesStale,
  moveAppointmentSeries,
  previewMoveAppointmentSeries,
  seriesConflictsOf,
  seriesLabel,
  type AppointmentSeriesChange,
  type SeriesPreview,
} from '@/lib/appointments/appointment-series-api';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';

const copy = {
  title: 'Mover a…',
  description: (patient: string) =>
    `Elige la fecha, la hora y el profesional para la cita de ${patient}. Se conserva la duración.`,
  // DX-492: con sillones, el modal también lo cambia.
  descriptionWithChair: (patient: string) =>
    `Elige la fecha, la hora, el profesional y el sillón para la cita de ${patient}. Se conserva la duración.`,
  date: 'Fecha',
  time: 'Hora de inicio',
  provider: 'Profesional',
  // DX-211: cambiar o quitar el sillón al mover (o solo eso).
  chair: 'Sillón',
  chairNone: 'Sin sillón',
  // DX-479: otro sillón con otro profesional por defecto: se ofrece, no se cambia solo.
  chairProviderOffer: (chair: string, offered: string, current: string) =>
    `«${chair}» tiene a ${offered} como profesional por defecto. La cita sigue con ${current} salvo que la asignes.`,
  assignProvider: (offered: string) => `Asignar a ${offered}`,
  submit: 'Mover cita',
  duration: (minutes: number, end: string) => endSentence(`Dura ${minutes} min: terminaría a las ${end}`),
  missing: 'Completa la fecha, la hora y el profesional.',
  past: 'No se puede mover una cita al pasado. Elige una fecha y hora futuras.',
  outsideHours: (ranges: string) =>
    ranges === ''
      ? 'La sede no atiende ese día.'
      : endSentence(`Fuera del horario de atención. Ese día se atiende: ${ranges}`),
  genericError: 'No pudimos mover la cita. Intenta de nuevo.',
  // DX-509-bis: un sobrecupo que no cabe donde se pidió.
  nextOpeningSearching: 'Buscando el siguiente hueco libre…',
  nextOpeningTitle: 'Siguiente hueco libre',
  // DX-492-bis: con sillón, la sugerencia lo deja libre y lo dice.
  nextOpening: (when: string, provider: string, chair: string | null) =>
    endSentence(chair ? `${when} con ${provider}, en «${chair}»` : `${when} con ${provider}`),
  useNextOpening: 'Usar este hueco',
  noNextOpening: (chair: string | null) =>
    chair
      ? `No hay huecos libres de ese profesional con «${chair}» en los próximos ${NEXT_OPENING_DAYS} días. Prueba con otro profesional u otro sillón, o mantenla donde está.`
      : `No hay huecos libres de ese profesional en los próximos ${NEXT_OPENING_DAYS} días. Prueba con otro profesional o mantenla donde está.`,
  nextOpeningError: 'No pudimos buscar el siguiente hueco libre. Elige otra hora a mano.',
  // DX-562: cita de una serie.
  scope: 'Qué citas mover',
  scopeHint: (label: string) => `Esta cita es de una serie (${label}).`,
  scopeOne: 'Solo esta cita',
  scopeOneHint: 'Las demás citas de la serie no cambian.',
  scopeFollowing: 'Esta y las siguientes',
  scopeFollowingHint:
    'Las siguientes pendientes se desplazan los mismos días y toman la nueva hora. Mismo profesional y sillón.',
  seriesCheck: 'Ver fechas',
  seriesChecking: 'Revisando las fechas…',
  seriesTitle: 'Así quedarían las citas',
  seriesFree: 'Libre',
  seriesConflict: 'Choca',
  seriesBlocked: (n: number) =>
    n === 1
      ? '1 fecha choca. Las citas de una serie no se ajustan aquí: muévela primero por separado («Solo esta cita») y luego vuelve a mover las siguientes, o elige otra hora para todas.'
      : `${n} fechas chocan. Las citas de una serie no se ajustan aquí: muévelas primero por separado («Solo esta cita») y luego vuelve a mover las siguientes, o elige otra hora para todas.`,
  seriesSubmit: (n: number) => (n === 1 ? 'Mover 1 cita' : `Mover ${n} citas`),
  seriesChange: 'Cambiar la hora',
  seriesError: 'No pudimos mover las citas de la serie. Intenta de nuevo.',
};

type MoveScope = 'one' | 'following';

/** El reloj se lee al enviar (en el manejador), nunca al pintar. */
function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** `chair`: el nombre del sillón con el que se buscó (DX-492-bis); sin él, null. */
type NextOpening =
  | { status: 'searching' }
  | { status: 'found'; target: MoveTarget; chair: string | null; defaultHours: boolean }
  | { status: 'none'; chair: string | null; defaultHours: boolean }
  | { status: 'error' };

interface MoveAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  appointment: Appointment;
  /** DX-378: reloj de la sede de la cita: la fecha y la hora elegidas son las de su reloj. */
  clock: SedeClock;
  providers: StaffMember[];
  /** Horario de la sede, para avisar antes de enviar (el servidor manda: 422). */
  hours: BusinessHours | null;
  /**
   * DX-211: sillones de la sede de la cita. Con alguno (o si la cita ya
   * tiene sillón) se puede cambiar o quitar el sillón; un desactivado solo
   * sale si es el de la cita (la API no deja elegirlo de nuevo).
   */
  chairs?: Chair[];
  onMoved: (updated: Appointment) => void;
  /**
   * DX-509-bis: el arrastre de un sobrecupo a una hora ocupada. El modal se
   * abre con ese destino, el mensaje del servidor y el siguiente hueco libre.
   */
  collision?: { target: MoveTarget; error: unknown; message: string } | null;
  /**
   * DX-562: con una cita pendiente de una serie se elige «Solo esta cita» o
   * «Esta y las siguientes» (vista previa y `POST /appointments/series/:id/move`).
   */
  onSeriesMoved?: (result: AppointmentSeriesChange) => void;
  /** DX-562: otra persona cambió alguna cita de la serie a la vez: recargar la agenda. */
  onSeriesStale?: () => void;
  /** DX-562: destino propuesto (p. ej. el arrastre de una cita de serie), sin error. */
  initialTarget?: MoveTarget | null;
}

/**
 * «Mover a…» (DX-121): la alternativa sin ratón al arrastre — teclado y
 * táctil. Un solo PATCH con fecha, hora y profesional; si el servidor lo
 * rechaza (409 solape, 422 fuera de horario), el modal sigue abierto con su
 * mensaje y la cita no cambia.
 */
export function MoveAppointmentDialog({
  open,
  onOpenChange,
  token,
  appointment,
  clock,
  providers,
  hours,
  onMoved,
  chairs = [],
  collision = null,
  onSeriesMoved,
  onSeriesStale,
  initialTarget = null,
}: MoveAppointmentDialogProps) {
  const { timeZone, fmt } = clock;
  const initial = collision?.target ?? initialTarget ?? appointment;
  const series = appointment.series;
  const offersSeries = !!series && isPendingSeriesStatus(appointment.status) && onSeriesMoved !== undefined;
  const [scope, setScope] = useState<MoveScope>('one');
  const following = offersSeries && scope === 'following';
  // La vista previa de «esta y las siguientes» para un inicio concreto.
  const [seriesPlan, setSeriesPlan] = useState<{ start: string; preview: SeriesPreview } | null>(null);
  const [date, setDate] = useState(() => wallDay(initial.start, timeZone));
  const [time, setTime] = useState(() => formatMinute(minuteOfDay(initial.start, timeZone)));
  const [providerId, setProviderId] = useState(initial.providerId);
  const [nextOpening, setNextOpening] = useState<NextOpening | null>(() =>
    collision && canOfferNextOpening(appointment, collision.error) ? { status: 'searching' } : null,
  );
  // Solo cuenta la última búsqueda (cambiar de hora y reenviar la deja vieja).
  const search = useRef(0);
  // DX-479: si el arrastre que chocó llevaba sillón, el modal parte de ese sillón.
  const [chairId, setChairId] = useState(
    collision?.target.chairId !== undefined ? (collision.target.chairId ?? '') : (appointment.chairId ?? ''),
  );
  const chairOptions = chairs.filter((c) => c.active || c.id === appointment.chairId);
  const showChair = chairOptions.length > 0 || !!appointment.chair;
  // DX-479: al elegir OTRO sillón con otro profesional por defecto se ofrece
  // asignarlo; el selector de profesional no cambia solo («Mantener» es no tocarlo).
  const offeredProviderId =
    chairId !== (appointment.chairId ?? '')
      ? offeredProvider(
          providerId,
          chairOptions.find((c) => c.id === chairId) ?? null,
          providers.map((p) => p.userId),
        )
      : null;
  const [error, setError] = useState<string | null>(collision?.message ?? null);
  const [submitting, setSubmitting] = useState(false);

  /** Activo según la lista de la sede; sin ella, según la cita. */
  function isActiveChair(id: string): boolean {
    const known = chairs.find((c) => c.id === id) ?? (appointment.chair?.id === id ? appointment.chair : null);
    return known?.active !== false;
  }

  /** Nombre del sillón con el que se busca el hueco (DX-492-bis); sin sillón, null. */
  function chairName(id: string): string | null {
    if (!id) return null;
    return chairOptions.find((c) => c.id === id)?.name ?? (appointment.chair?.id === id ? appointment.chair.name : null);
  }

  /** Busca el siguiente hueco; solo cuenta la última búsqueda. */
  function searchNextOpening(target: MoveTarget) {
    const id = ++search.current;
    // Un sillón desactivado (el de la cita) no se puede pedir a «Buscar hueco»
    // (400): se busca sin él y la sugerencia no lo nombra.
    const searchChairId = chairId && isActiveChair(chairId) ? chairId : null;
    const chair = chairName(searchChairId ?? '');
    findNextOpening(token, appointment, target, timeZone, searchChairId).then(
      ({ target: found, defaultHours }) => {
        if (search.current === id) {
          setNextOpening(
            found ? { status: 'found', target: found, chair, defaultHours } : { status: 'none', chair, defaultHours },
          );
        }
      },
      () => {
        if (search.current === id) setNextOpening({ status: 'error' });
      },
    );
  }

  function offerNextOpening(err: unknown, target: MoveTarget) {
    if (!canOfferNextOpening(appointment, err)) return;
    setNextOpening({ status: 'searching' });
    searchNextOpening(target);
  }

  useEffect(() => {
    // Abierto por el choque de un arrastre: el estado ya nace «buscando».
    if (collision && canOfferNextOpening(appointment, collision.error)) searchNextOpening(collision.target);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyOpening(target: MoveTarget) {
    setDate(wallDay(target.start, timeZone));
    setTime(formatMinute(minuteOfDay(target.start, timeZone)));
    setProviderId(target.providerId);
    setError(null);
    setNextOpening(null);
    search.current++;
  }

  const providerName = (id: string) => providers.find((p) => p.userId === id)?.fullName ?? '';

  const duration = Math.round(
    (new Date(appointment.end).getTime() - new Date(appointment.start).getTime()) / 60000,
  );
  const startMinute = timeToMinutes(time);
  const endLabel = startMinute === null ? null : sedeMinute((startMinute + duration) % (24 * 60), fmt);

  async function submit(patch: Parameters<typeof updateAppointment>[2]) {
    setSubmitting(true);
    try {
      const updated = await updateAppointment(token, appointment.id, patch);
      onMoved(updated);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
      if ('start' in patch && patch.start && patch.end && patch.providerId) {
        offerNextOpening(err, { start: patch.start, end: patch.end, providerId: patch.providerId });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const holiday = useHolidayOnDay(token, appointment.locationId, date);
  const inClinic = isInClinic(appointment.status);

  /** DX-562: «Esta y las siguientes»: primero la vista previa, luego confirmar. */
  async function submitSeries() {
    if (!series || !onSeriesMoved || startMinute === null) return;
    const start = moveTarget(appointment, date, startMinute, appointment.providerId, timeZone).start;
    setSubmitting(true);
    try {
      if (seriesPlan && seriesPlan.start === start) {
        onSeriesMoved(await moveAppointmentSeries(token, series.id, { fromAppointmentId: appointment.id, start }));
        return;
      }
      const preview = await previewMoveAppointmentSeries(token, series.id, { fromAppointmentId: appointment.id, start });
      setSeriesPlan({ start, preview });
    } catch (err) {
      setError(apiErrorMessage(err, copy.seriesError));
      if (isSeriesStale(err)) onSeriesStale?.();
      // Ya no estaban libres al confirmar: se vuelve a revisar la lista.
      if (seriesConflictsOf(err) !== null) {
        try {
          setSeriesPlan({
            start,
            preview: await previewMoveAppointmentSeries(token, series.id, { fromAppointmentId: appointment.id, start }),
          });
        } catch {
          setSeriesPlan(null);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNextOpening(null);
    search.current++;
    if (!isCivilDay(date) || startMinute === null || !providerId) {
      setError(copy.missing);
      return;
    }
    if (following) {
      const pivot = moveTarget(appointment, date, startMinute, appointment.providerId, timeZone);
      if (seriesPlan === null || seriesPlan.start !== pivot.start) {
        if (isPast(pivot.start)) {
          setError(copy.past);
          return;
        }
        if (!fitsBusinessHoursLocal(date, time, formatMinute(startMinute + duration), hours)) {
          setError(copy.outsideHours(describeDay(civilWeekday(date), hours, fmt)));
          return;
        }
        if (holiday.status === 'holiday') {
          setError(holidayClosedMessage(holiday.name));
          return;
        }
      }
      await submitSeries();
      return;
    }
    const slot = moveTarget(appointment, date, startMinute, providerId, timeZone);
    const chairChange = (appointment.chairId ?? '') !== chairId ? { chairId: chairId || null } : null;
    // DX-211 (revisión A1): misma fecha, hora y profesional y otro sillón no
    // es reagendar: solo se manda el sillón (no anula la confirmación y vale
    // con el paciente ya en la clínica), sin mirar pasado ni horario.
    const sameSlot =
      date === wallDay(appointment.start, timeZone) &&
      startMinute === minuteOfDay(appointment.start, timeZone) &&
      providerId === appointment.providerId;
    if (sameSlot && chairChange) {
      await submit(chairChange);
      return;
    }
    const target = { ...slot, ...chairChange };
    if (isPast(target.start)) {
      setError(copy.past);
      return;
    }
    if (!fitsBusinessHoursLocal(date, time, formatMinute(startMinute + duration), hours)) {
      setError(copy.outsideHours(describeDay(civilWeekday(date), hours, fmt)));
      return;
    }
    // DX-263-bis: la sede cerrada por festivo (con el paciente ya en la
    // clínica la cita no sale de hoy y la API la deja mover).
    if (holiday.status === 'holiday' && !inClinic) {
      setError(holidayClosedMessage(holiday.name));
      return;
    }
    await submit(target);
  }

  const seriesConflicts = seriesPlan?.preview.occurrences.filter((o) => o.status === 'CONFLICT').length ?? 0;
  const submitLabel = following
    ? seriesPlan
      ? copy.seriesSubmit(seriesPlan.preview.occurrences.length)
      : copy.seriesCheck
    : copy.submit;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={(showChair ? copy.descriptionWithChair : copy.description)(patientLabel(appointment))}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      submitting={submitting}
      submitDisabled={following && seriesPlan !== null && seriesConflicts > 0}
      error={error}
    >
      {offersSeries && series && !seriesPlan ? (
        <RadioGroup
          id="move-scope"
          legend={copy.scope}
          hint={copy.scopeHint(seriesLabel(series))}
          value={scope}
          onValueChange={(v) => {
            setScope(v === 'following' ? 'following' : 'one');
            setError(null);
          }}
          disabled={submitting}
          optionsClassName="gap-2"
        >
          <RadioCard id="move-scope-one" value="one" title={copy.scopeOne} description={copy.scopeOneHint} />
          <RadioCard
            id="move-scope-following"
            value="following"
            title={copy.scopeFollowing}
            description={copy.scopeFollowingHint}
          />
        </RadioGroup>
      ) : null}
      {following && seriesPlan ? (
        <SeriesMovePlan
          preview={seriesPlan.preview}
          conflicts={seriesConflicts}
          fmt={fmt}
          disabled={submitting}
          onChange={() => {
            setSeriesPlan(null);
            setError(null);
          }}
        />
      ) : (
        <>
      {following ? null : nextOpening ? (
        <Callout
          tone={nextOpening.status === 'found' ? 'info' : 'neutral'}
          title={nextOpening.status === 'found' ? copy.nextOpeningTitle : undefined}
          role="status"
          data-testid="move-next-opening"
          action={
            nextOpening.status === 'found' ? (
              <Button type="button" size="sm" variant="outline" onClick={() => applyOpening(nextOpening.target)}>
                {copy.useNextOpening}
              </Button>
            ) : undefined
          }
        >
          {nextOpening.status === 'searching'
            ? copy.nextOpeningSearching
            : nextOpening.status === 'found'
              ? copy.nextOpening(
                  fmt.dateTime(new Date(nextOpening.target.start), timeZone),
                  providerName(nextOpening.target.providerId),
                  nextOpening.chair,
                )
              : nextOpening.status === 'none'
                ? copy.noNextOpening(nextOpening.chair)
                : copy.nextOpeningError}
          {/* DX-533: en una sede sin horario solo se proponen huecos del de alta. */}
          {(nextOpening.status === 'found' || nextOpening.status === 'none') && nextOpening.defaultHours ? (
            <span data-testid="move-default-hours" className="mt-1 block text-xs">
              {defaultHoursNote(fmt)}
            </span>
          ) : null}
        </Callout>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="move-date" label={copy.date}>
          <DatePicker
            id="move-date"
            required
            value={date || null}
            onChange={(next) => setDate(next ?? '')}
          />
          {inClinic ? null : <HolidayNotice state={holiday} />}
        </FormField>
        <FormField
          htmlFor="move-time"
          label={copy.time}
          hint={endLabel ? copy.duration(duration, endLabel) : undefined}
        >
          <TimeField
            id="move-time"
            required
            value={time || null}
            onChange={(next) => setTime(next ?? '')}
          />
        </FormField>
      </div>
      {following ? null : (<>
      <FormField htmlFor="move-provider" label={copy.provider}>
        <NativeSelect
          id="move-provider"
          required
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
      {showChair ? (
        <FormField htmlFor="move-chair" label={copy.chair}>
          <NativeSelect id="move-chair" value={chairId} onChange={(e) => setChairId(e.target.value)}>
            <option value="">{copy.chairNone}</option>
            {chairOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {chairDisplayName(c)}
              </option>
            ))}
            {appointment.chair && !chairOptions.some((c) => c.id === appointment.chair?.id) ? (
              <option value={appointment.chair.id}>{chairDisplayName(appointment.chair)}</option>
            ) : null}
          </NativeSelect>
        </FormField>
      ) : null}
      {offeredProviderId !== null ? (
        <Callout
          tone="info"
          role="status"
          data-testid="move-chair-provider-offer"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => setProviderId(offeredProviderId)}>
              {copy.assignProvider(providerName(offeredProviderId))}
            </Button>
          }
        >
          {copy.chairProviderOffer(
            chairOptions.find((c) => c.id === chairId)?.name ?? '',
            providerName(offeredProviderId),
            providerName(providerId),
          )}
        </Callout>
      ) : null}
      </>)}
        </>
      )}
    </FormModal>
  );
}

/** DX-562: la lista de «esta y las siguientes» antes de confirmar (sin edición por fecha). */
function SeriesMovePlan({
  preview,
  conflicts,
  fmt,
  disabled,
  onChange,
}: {
  preview: SeriesPreview;
  conflicts: number;
  fmt: SedeClock['fmt'];
  disabled: boolean;
  onChange: () => void;
}) {
  const tz = preview.timeZone;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="flex flex-col gap-3" data-testid="series-move-preview">
      <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-ink focus:outline-none">
        {copy.seriesTitle}
      </h3>
      <ol className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
        {preview.occurrences.map((o) => (
          <li key={o.index} className="flex flex-col gap-1 px-3 py-2" data-testid={`series-move-${o.index}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                <span className="tabular-nums text-muted">{o.index}.</span>{' '}
                <span className="font-medium">{fmt.longDate(new Date(o.start), tz, { weekday: true })}</span>,{' '}
                <time dateTime={o.start} className="tabular-nums">{fmt.time(new Date(o.start), tz)}</time>
              </p>
              <Badge variant={o.status === 'CONFLICT' ? 'danger' : 'success'} dot>
                {o.status === 'CONFLICT' ? copy.seriesConflict : copy.seriesFree}
              </Badge>
            </div>
            {o.reasons.length > 0 ? (
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-danger-text">
                {o.reasons.map((r) => (
                  <li key={`${r.code}-${r.message}`}>{r.message}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      {conflicts > 0 ? (
        <Callout tone="warning" role="status" data-testid="series-move-blocked">
          {copy.seriesBlocked(conflicts)}
        </Callout>
      ) : null}
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={disabled} onClick={onChange}>
        {copy.seriesChange}
      </Button>
    </div>
  );
}

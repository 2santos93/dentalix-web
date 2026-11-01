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
import { chairDisplayName } from '@/lib/chairs/chair-columns';
import { endSentence } from '@/lib/format/text';

const copy = {
  title: 'Mover a…',
  description: (patient: string) =>
    `Elige la fecha, la hora y el profesional para la cita de ${patient}. Se conserva la duración.`,
  date: 'Fecha',
  time: 'Hora de inicio',
  provider: 'Profesional',
  // DX-211: cambiar o quitar el sillón al mover (o solo eso).
  chair: 'Sillón',
  chairNone: 'Sin sillón',
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
  nextOpening: (when: string, provider: string) => endSentence(`${when} con ${provider}`),
  useNextOpening: 'Usar este hueco',
  noNextOpening: `No hay huecos libres de ese profesional en los próximos ${NEXT_OPENING_DAYS} días. Prueba con otro profesional o mantenla donde está.`,
  nextOpeningError: 'No pudimos buscar el siguiente hueco libre. Elige otra hora a mano.',
};

type NextOpening =
  | { status: 'searching' }
  | { status: 'found'; target: MoveTarget }
  | { status: 'none' }
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
}: MoveAppointmentDialogProps) {
  const { timeZone, fmt } = clock;
  const initial = collision?.target ?? appointment;
  const [date, setDate] = useState(() => wallDay(initial.start, timeZone));
  const [time, setTime] = useState(() => formatMinute(minuteOfDay(initial.start, timeZone)));
  const [providerId, setProviderId] = useState(initial.providerId);
  const [nextOpening, setNextOpening] = useState<NextOpening | null>(() =>
    collision && canOfferNextOpening(appointment, collision.error) ? { status: 'searching' } : null,
  );
  // Solo cuenta la última búsqueda (cambiar de hora y reenviar la deja vieja).
  const search = useRef(0);
  const [chairId, setChairId] = useState(appointment.chairId ?? '');
  const chairOptions = chairs.filter((c) => c.active || c.id === appointment.chairId);
  const showChair = chairOptions.length > 0 || !!appointment.chair;
  const [error, setError] = useState<string | null>(collision?.message ?? null);
  const [submitting, setSubmitting] = useState(false);

  /** Busca el siguiente hueco; solo cuenta la última búsqueda. */
  function searchNextOpening(target: MoveTarget) {
    const id = ++search.current;
    findNextOpening(token, appointment, target, timeZone).then(
      (found) => {
        if (search.current === id) setNextOpening(found ? { status: 'found', target: found } : { status: 'none' });
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNextOpening(null);
    search.current++;
    if (!isCivilDay(date) || startMinute === null || !providerId) {
      setError(copy.missing);
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
    if (new Date(target.start).getTime() < Date.now()) {
      setError(copy.past);
      return;
    }
    if (!fitsBusinessHoursLocal(date, time, formatMinute(startMinute + duration), hours)) {
      setError(copy.outsideHours(describeDay(civilWeekday(date), hours, fmt)));
      return;
    }
    await submit(target);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(patientLabel(appointment))}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      {nextOpening ? (
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
                )
              : nextOpening.status === 'none'
                ? copy.noNextOpening
                : copy.nextOpeningError}
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
    </FormModal>
  );
}

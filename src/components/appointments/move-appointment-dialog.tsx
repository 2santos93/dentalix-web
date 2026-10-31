'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { updateAppointment, type Appointment } from '@/lib/appointments/appointments-api';
import type { StaffMember } from '@/lib/appointments/staff-api';
import {
  describeDay,
  fitsBusinessHoursLocal,
  timeToMinutes,
  type BusinessHours,
} from '@/lib/locations/schedule-api';
import { formatMinute, minuteOfDay, moveTarget } from '@/lib/appointments/day-grid';
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
import { endSentence } from '@/lib/format/text';

const copy = {
  title: 'Mover a…',
  description: (patient: string) =>
    `Elige la fecha, la hora y el profesional para la cita de ${patient}. Se conserva la duración.`,
  date: 'Fecha',
  time: 'Hora de inicio',
  provider: 'Profesional',
  submit: 'Mover cita',
  duration: (minutes: number, end: string) => endSentence(`Dura ${minutes} min: terminaría a las ${end}`),
  missing: 'Completa la fecha, la hora y el profesional.',
  past: 'No se puede mover una cita al pasado. Elige una fecha y hora futuras.',
  outsideHours: (ranges: string) =>
    ranges === ''
      ? 'La sede no atiende ese día.'
      : endSentence(`Fuera del horario de atención. Ese día se atiende: ${ranges}`),
  genericError: 'No pudimos mover la cita. Intenta de nuevo.',
};

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
  onMoved: (updated: Appointment) => void;
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
}: MoveAppointmentDialogProps) {
  const { timeZone, fmt } = clock;
  const [date, setDate] = useState(() => wallDay(appointment.start, timeZone));
  const [time, setTime] = useState(() => formatMinute(minuteOfDay(appointment.start, timeZone)));
  const [providerId, setProviderId] = useState(appointment.providerId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const duration = Math.round(
    (new Date(appointment.end).getTime() - new Date(appointment.start).getTime()) / 60000,
  );
  const startMinute = timeToMinutes(time);
  const endLabel = startMinute === null ? null : sedeMinute((startMinute + duration) % (24 * 60), fmt);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isCivilDay(date) || startMinute === null || !providerId) {
      setError(copy.missing);
      return;
    }
    const target = moveTarget(appointment, date, startMinute, providerId, timeZone);
    if (new Date(target.start).getTime() < Date.now()) {
      setError(copy.past);
      return;
    }
    if (!fitsBusinessHoursLocal(date, time, formatMinute(startMinute + duration), hours)) {
      setError(copy.outsideHours(describeDay(civilWeekday(date), hours, fmt)));
      return;
    }
    setSubmitting(true);
    try {
      const updated = await updateAppointment(token, appointment.id, target);
      onMoved(updated);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
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
    </FormModal>
  );
}

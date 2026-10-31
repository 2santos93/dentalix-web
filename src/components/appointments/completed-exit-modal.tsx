'use client';
import { Textarea } from '@/components/ui/textarea';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  updateAppointment,
  type AppointmentStatus,
  type AppointmentWriteDetail,
} from '@/lib/appointments/appointments-api';
import {
  STATUS_REASON_MAX,
  STATUS_REASON_MIN,
  validStatusReason,
} from '@/lib/appointments/plan-item-reservations';
import { STATUS_LABELS } from '@/components/appointments/appointment-display';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/errors/inline-error';

export const completedExitCopy = {
  title: (to: string) => `¿Pasar la cita completada a «${to}»?`,
  description:
    'Esta cita fija el intervalo mínimo de la visita siguiente del plan. Al sacarla de «Completada», ese mínimo se recalcula con la última cita de la visita anterior que siga completada (o deja de haberlo). Queda registrado quién lo hizo, cuándo y por qué.',
  reason: 'Motivo',
  hint: `Entre ${STATUS_REASON_MIN} y ${STATUS_REASON_MAX} caracteres.`,
  tooShort: `Escribe el motivo (al menos ${STATUS_REASON_MIN} caracteres).`,
  submit: 'Sacar de «Completada»',
  genericError: 'No pudimos cambiar el estado de la cita. Intenta de nuevo.',
};


interface CompletedExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  appointmentId: string;
  /** Estado al que pasa la cita. */
  to: AppointmentStatus;
  onDone: (result: AppointmentWriteDetail) => void;
}

/**
 * DX-273: sacar una cita de «Completada» (solo odontólogo y administración)
 * pide un motivo de 3 a 500 caracteres, que la API guarda y audita.
 */
export function CompletedExitModal({
  open,
  onOpenChange,
  token,
  appointmentId,
  to,
  onDone,
}: CompletedExitModalProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validStatusReason(reason)) {
      setValidation(completedExitCopy.tooShort);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateAppointment(token, appointmentId, {
        status: to,
        statusReason: reason.trim(),
      });
      onDone(result);
    } catch (err) {
      setError(apiErrorMessage(err, completedExitCopy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={completedExitCopy.title(STATUS_LABELS[to])}
      description={completedExitCopy.description}
      onSubmit={handleSubmit}
      submitLabel={completedExitCopy.submit}
      submitting={submitting}
      error={error}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{completedExitCopy.reason}</Label>
        <Textarea
          id={id}
          rows={3}
          autoGrow
          maxLength={STATUS_REASON_MAX}
          value={reason}
          disabled={submitting}
          aria-invalid={validation ? true : undefined}
          aria-describedby={hintId}
          onChange={(e) => {
            setReason(e.target.value);
            setValidation(null);
          }}
        />
        <div id={hintId}>
          {validation ? (
            <InlineError className="text-xs">{validation}</InlineError>
          ) : (
            <p className="text-xs text-muted">{completedExitCopy.hint}</p>
          )}
        </div>
      </div>
    </FormModal>
  );
}

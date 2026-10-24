'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  WAIVE_REASON_MAX,
  WAIVE_REASON_MIN,
  voidCancellationFee,
  type CancellationFeeView,
} from '@/lib/cancellations/cancellation-fee-api';
import { FormModal } from '@/components/shared/form-modal';
import { fieldErrorId } from '@/components/shared/form-field';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

/** El motivo de condonar o anular un cargo (DX-291, SEC-050): 3–500. */
export const feeReasonCopy = {
  reason: 'Motivo',
  reasonError: `Escribe el motivo (de ${WAIVE_REASON_MIN} a ${WAIVE_REASON_MAX} caracteres).`,
  counter: (n: number) => `${n}/${WAIVE_REASON_MAX}`,
};

/** SEC-050: anular un cargo ya generado. */
export const voidFeeCopy = {
  action: 'Anular cargo',
  title: 'Anular el cargo',
  description:
    'El cargo deja de cobrarse y su ítem sale del plan «Cargos administrativos». El motivo queda con el cargo y la anulación, en la auditoría. No se deshace.',
  done: 'Cargo anulado.',
  error: 'No pudimos anular el cargo. Intenta de nuevo.',
};

interface FeeReasonModalProps {
  title: string;
  description: string;
  submitLabel: string;
  /** Lo que se hace con el motivo ya recortado (y validado). */
  submit: (reason: string) => Promise<CancellationFeeView>;
  doneMessage: string;
  errorMessage: string;
  onClose: () => void;
  onDone: (view: CancellationFeeView) => void;
  /** 409: otra persona ya decidió (o ya se cobró); quien abrió se relee. */
  onStale: () => void;
}

/**
 * Diálogo con el motivo obligatorio (3–500, contador n/500) de una decisión
 * sobre el cargo de una cita: condonarlo (DX-291) o anularlo (SEC-050). El
 * error del campo lleva el foco al motivo; el del servidor sale tal cual.
 */
export function FeeReasonModal({
  title,
  description,
  submitLabel,
  submit,
  doneMessage,
  errorMessage,
  onClose,
  onDone,
  onStale,
}: FeeReasonModalProps) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < WAIVE_REASON_MIN || trimmed.length > WAIVE_REASON_MAX) {
      setFieldError(feeReasonCopy.reasonError);
      document.getElementById(reasonId)?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await submit(trimmed);
      toast.success(doneMessage);
      onDone(next);
    } catch (err) {
      setError(apiErrorMessage(err, errorMessage));
      if (err instanceof ApiError && err.status === 409) onStale();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      submitting={submitting}
      error={error}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>{feeReasonCopy.reason}</Label>
        <textarea
          id={reasonId}
          rows={3}
          maxLength={WAIVE_REASON_MAX}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={`${fieldError ? `${fieldErrorId(reasonId)} ` : ''}${reasonId}-counter`}
          className={cn(fieldClass, fieldError && 'border-danger')}
        />
        <div className="flex items-start justify-between gap-3 text-xs">
          {fieldError ? (
            <p id={fieldErrorId(reasonId)} role="alert" className="text-sm text-danger">
              {fieldError}
            </p>
          ) : (
            <span />
          )}
          <p id={`${reasonId}-counter`} className="shrink-0 tabular-nums text-muted">
            {feeReasonCopy.counter(reason.length)}
          </p>
        </div>
      </div>
    </FormModal>
  );
}

/**
 * SEC-050: «Anular cargo» con motivo. Lo abren el detalle de la cita y el
 * plan «Cargos administrativos»; el servidor decide quién puede (ADMIN, o
 * RECEPTION si la política lo permite) y si ya está cobrado (409).
 */
export function VoidCancellationFeeModal({
  token,
  appointmentId,
  onClose,
  onDone,
  onStale,
}: {
  token: string;
  appointmentId: string;
  onClose: () => void;
  onDone: (view: CancellationFeeView) => void;
  onStale: () => void;
}) {
  return (
    <FeeReasonModal
      title={voidFeeCopy.title}
      description={voidFeeCopy.description}
      submitLabel={voidFeeCopy.action}
      submit={(reason) => voidCancellationFee(token, appointmentId, reason)}
      doneMessage={voidFeeCopy.done}
      errorMessage={voidFeeCopy.error}
      onClose={onClose}
      onDone={onDone}
      onStale={onStale}
    />
  );
}

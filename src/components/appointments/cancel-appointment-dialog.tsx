'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  updateAppointment,
  type AppointmentStatus,
  type AppointmentWriteDetail,
} from '@/lib/appointments/appointments-api';
import { isInClinic } from '@/lib/appointments/patient-flow';
import {
  CANCEL_REASON_TEXT_MAX,
  CANCELLATION_KIND_HINTS,
  CANCELLATION_KIND_LABELS,
  CANCELLATION_REASON_CODES,
  CANCELLATION_REASON_LABELS,
  STAFF_CANCELLATION_KINDS,
  getCancellationPreview,
  lateCancellationWarning,
  type CancellationPreview,
  type CancellationReasonCode,
  type StaffCancellationKind,
} from '@/lib/cancellations/cancellation';
import {
  STATUS_REASON_MAX,
  validStatusReason,
} from '@/lib/appointments/plan-item-reservations';
import { completedExitCopy } from '@/components/appointments/completed-exit-modal';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const cancelAppointmentCopy = {
  title: (patient: string) => `Cancelar la cita de ${patient}`,
  description:
    'Indica quién cancela y por qué. La hora y el aviso los calcula el sistema; queda registrado quién lo hizo.',
  origin: 'Quién cancela',
  originRequired: 'Elige quién cancela.',
  reason: 'Motivo',
  reasonPlaceholder: 'Elige un motivo',
  reasonRequired: 'Elige el motivo.',
  detail: 'Detalle (opcional)',
  detailHint: 'Sin datos de salud: basta con el motivo.',
  counter: (n: number) => `${n}/${CANCEL_REASON_TEXT_MAX}`,
  previewLoading: 'Calculando el aviso…',
  previewFailed: 'Aviso sin calcular',
  noPolicy: 'La sede no tiene política de cancelación: no cuenta como tardía.',
  onTime: (hours: number) => `Con aviso suficiente (la política pide ${hours} h).`,
  attended: 'El paciente ya vino a la cita: esta cancelación no cuenta como tardía.',
  exitReason: 'Por qué se deshace la cita completada',
  clinicNeverLate: 'Una cancelación de la clínica nunca cuenta como tardía.',
  submit: 'Cancelar la cita',
  back: 'Volver',
  genericError: 'No pudimos cancelar la cita. Intenta de nuevo.',
};

const copy = cancelAppointmentCopy;

interface CancelAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  appointmentId: string;
  patientName: string;
  /**
   * Estado actual de la cita. Desde «Completada» (DX-273) pide además el
   * motivo de esa salida (solo odontólogo y administración). Si el paciente
   * ya vino (en la clínica o completada), la cancelación nunca es tardía.
   */
  fromStatus: AppointmentStatus;
  /** Dónde queda el foco al cerrar (por defecto, donde estaba al abrir). */
  onCloseAutoFocus?: (event: Event) => void;
  onDone: (result: AppointmentWriteDetail) => void;
}

/**
 * DX-279: cancelar una cita desde la agenda pide quién cancela (el paciente
 * avisa o la clínica) y el motivo (catálogo cerrado + detalle opcional). Antes
 * de confirmar, si la cancelación del paciente sería tardía según la política
 * de la sede, lo dice: «Cancelación tardía: aviso de 5 h, la política pide
 * 24 h». El servidor vuelve a calcularlo al guardar.
 */
export function CancelAppointmentDialog({
  open,
  onOpenChange,
  token,
  appointmentId,
  patientName,
  fromStatus,
  onCloseAutoFocus,
  onDone,
}: CancelAppointmentDialogProps) {
  const fromCompleted = fromStatus === 'COMPLETED';
  const attended = fromCompleted || isInClinic(fromStatus);
  const id = useId();
  const originName = `${id}-origin`;
  const reasonId = `${id}-reason`;
  const detailId = `${id}-detail`;
  const counterId = `${id}-counter`;
  const exitId = `${id}-exit`;
  const [byKind, setByKind] = useState<StaffCancellationKind | null>(null);
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | ''>('');
  const [detail, setDetail] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [errors, setErrors] = useState<{ origin?: string; reason?: string; exit?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCancellationPreview(token, appointmentId)
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        setPreviewFailed(false);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, appointmentId, previewKey]);

  function chooseOrigin(kind: StaffCancellationKind) {
    setByKind(kind);
    setErrors((e) => ({ ...e, origin: undefined }));
    // La clínica que cancela casi siempre reprograma: se propone ese motivo.
    if (kind === 'CLINIC' && reasonCode === '') setReasonCode('CLINIC_RESCHEDULE');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!byKind) next.origin = copy.originRequired;
    if (!reasonCode) next.reason = copy.reasonRequired;
    if (fromCompleted && !validStatusReason(exitReason)) next.exit = completedExitCopy.tooShort;
    setErrors(next);
    if (!byKind || !reasonCode || Object.keys(next).length > 0) {
      // Foco al primer campo con error (el primer radio, el motivo o la salida).
      const firstInvalid = next.origin
        ? `${originName}-${STAFF_CANCELLATION_KINDS[0]}`
        : next.reason
          ? reasonId
          : exitId;
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateAppointment(token, appointmentId, {
        status: 'CANCELLED',
        cancelledByKind: byKind,
        cancelReasonCode: reasonCode,
        ...(detail.trim() ? { cancelReasonText: detail.trim() } : {}),
        ...(fromCompleted ? { statusReason: exitReason.trim() } : {}),
      });
      onDone(result);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const warning = byKind === 'STAFF_FOR_PATIENT' ? lateCancellationWarning(preview) : null;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title(patientName)}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      cancelLabel={copy.back}
      submitting={submitting}
      error={error}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <fieldset
        role="radiogroup"
        className="flex flex-col gap-2"
        aria-invalid={errors.origin ? true : undefined}
        aria-describedby={errors.origin ? fieldErrorId(originName) : undefined}
      >
        <legend className="mb-1.5 text-sm font-medium text-ink">{copy.origin}</legend>
        {STAFF_CANCELLATION_KINDS.map((kind) => {
          const optionId = `${originName}-${kind}`;
          return (
            <label
              key={kind}
              htmlFor={optionId}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-bg',
                byKind === kind && 'border-primary',
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={originName}
                value={kind}
                checked={byKind === kind}
                disabled={submitting}
                onChange={() => chooseOrigin(kind)}
                aria-describedby={
                  errors.origin ? `${optionId}-hint ${fieldErrorId(originName)}` : `${optionId}-hint`
                }
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{CANCELLATION_KIND_LABELS[kind]}</span>
                <span id={`${optionId}-hint`} className="text-xs text-muted">
                  {CANCELLATION_KIND_HINTS[kind]}
                </span>
              </span>
            </label>
          );
        })}
        {errors.origin ? (
          <InlineError id={fieldErrorId(originName)} className="text-xs">
            {errors.origin}
          </InlineError>
        ) : null}
      </fieldset>

      <NoticeLine
        byKind={byKind}
        preview={preview}
        failed={previewFailed}
        warning={warning}
        attended={attended}
        onRetry={() => {
          setPreviewFailed(false);
          setPreviewKey((k) => k + 1);
        }}
      />

      <FormField htmlFor={reasonId} label={copy.reason} error={errors.reason}>
        <select
          id={reasonId}
          className={cn(fieldClass, 'h-10', errors.reason && 'border-danger')}
          value={reasonCode}
          disabled={submitting}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? fieldErrorId(reasonId) : undefined}
          onChange={(e) => {
            setReasonCode(e.target.value as CancellationReasonCode | '');
            setErrors((x) => ({ ...x, reason: undefined }));
          }}
        >
          <option value="">{copy.reasonPlaceholder}</option>
          {CANCELLATION_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {CANCELLATION_REASON_LABELS[code]}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={detailId}>{copy.detail}</Label>
        <textarea
          id={detailId}
          rows={2}
          maxLength={CANCEL_REASON_TEXT_MAX}
          value={detail}
          disabled={submitting}
          aria-describedby={`${detailId}-hint ${counterId}`}
          onChange={(e) => setDetail(e.target.value)}
          className={fieldClass}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted">
          <p id={`${detailId}-hint`}>{copy.detailHint}</p>
          <p id={counterId} className="shrink-0 tabular-nums">
            {copy.counter(detail.length)}
          </p>
        </div>
      </div>

      {fromCompleted ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={exitId}>{copy.exitReason}</Label>
          <textarea
            id={exitId}
            rows={2}
            maxLength={STATUS_REASON_MAX}
            value={exitReason}
            disabled={submitting}
            aria-invalid={errors.exit ? true : undefined}
            aria-describedby={`${exitId}-hint`}
            onChange={(e) => {
              setExitReason(e.target.value);
              setErrors((x) => ({ ...x, exit: undefined }));
            }}
            className={fieldClass}
          />
          <div id={`${exitId}-hint`}>
            {errors.exit ? (
              <InlineError className="text-xs">{errors.exit}</InlineError>
            ) : (
              <p className="text-xs text-muted">{completedExitCopy.hint}</p>
            )}
          </div>
        </div>
      ) : null}
    </FormModal>
  );
}

/** El aviso de la cancelación, antes de confirmar. */
function NoticeLine({
  byKind,
  preview,
  failed,
  warning,
  attended,
  onRetry,
}: {
  byKind: StaffCancellationKind | null;
  preview: CancellationPreview | null;
  failed: boolean;
  warning: string | null;
  attended: boolean;
  onRetry: () => void;
}) {
  if (byKind === 'CLINIC') {
    return <p className="text-sm text-muted">{copy.clinicNeverLate}</p>;
  }
  if (failed) {
    return <FieldError label={copy.previewFailed} onRetry={onRetry} className="h-10" />;
  }
  if (!preview) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.previewLoading}
      </p>
    );
  }
  if (warning) {
    return (
      <p
        role="alert"
        data-testid="late-cancellation-warning"
        className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-ink"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
        <span>{warning}</span>
      </p>
    );
  }
  if (byKind === null) return null;
  if (attended) return <p className="text-sm text-muted">{copy.attended}</p>;
  return (
    <p className="text-sm text-muted">
      {preview.policy ? copy.onTime(preview.policy.noticeHours) : copy.noPolicy}
    </p>
  );
}

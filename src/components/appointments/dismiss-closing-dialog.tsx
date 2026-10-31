'use client';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/api-error';
import {
  CLOSING_DISMISSAL_REASONS,
  CLOSING_DISMISSAL_REASON_LABELS,
  DISMISSAL_TEXT_MAX,
  DISMISSAL_TEXT_MIN,
  dismissClosingItem,
  type ClosingDismissalReason,
  type ClosingQueueSection,
} from '@/lib/appointments/closing-queue-api';
import { FormModal } from '@/components/shared/form-modal';
import { fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

export const dismissClosingCopy = {
  title: 'Descartar de «Pendiente de cerrar»',
  description: (subject: string) =>
    `${subject}. Sale de la lista sin cambiar la cita, la historia ni el plan, y queda en el registro de auditoría.`,
  reason: 'Motivo',
  reasonRequired: 'Elige un motivo.',
  other: 'Escribe el motivo',
  otherRequired: `Escribe el motivo (de ${DISMISSAL_TEXT_MIN} a ${DISMISSAL_TEXT_MAX} caracteres).`,
  counter: (n: number) => `${n}/${DISMISSAL_TEXT_MAX}`,
  submit: 'Descartar',
  back: 'Volver',
  genericError: 'No pudimos descartar el pendiente. Intenta de nuevo.',
};

const copy = dismissClosingCopy;

/** Caracteres (puntos de código), como `char_length` en la BD. */
function chars(value: string): number {
  return [...value].length;
}

interface DismissClosingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  section: ClosingQueueSection;
  appointmentId: string;
  planItemId?: string;
  /** Qué se descarta, p. ej. «Ana Pérez · 30/10/2026 09:00». */
  subject: string;
  onDone: () => void;
  /** 409: ya no estaba pendiente (se cerró o se descartó a la vez). */
  onStale: () => void;
}

/**
 * DX-439: descartar UN pendiente con un motivo de la lista; «Otro» pide texto
 * (3–200). La API comprueba que sigue pendiente y que el rol lo cierra.
 */
export function DismissClosingDialog({
  open,
  onOpenChange,
  token,
  section,
  appointmentId,
  planItemId,
  subject,
  onDone,
  onStale,
}: DismissClosingDialogProps) {
  const id = useId();
  const reasonName = `${id}-reason`;
  const otherId = `${id}-other`;
  const counterId = `${id}-counter`;
  const [reasonCode, setReasonCode] = useState<ClosingDismissalReason | null>(null);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; other?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    // Caracteres, no unidades UTF-16: lo que cuenta la API y la BD.
    const length = chars(trimmed);
    const next = {
      reason: reasonCode === null ? copy.reasonRequired : undefined,
      other:
        reasonCode === 'OTHER' && (length < DISMISSAL_TEXT_MIN || length > DISMISSAL_TEXT_MAX)
          ? copy.otherRequired
          : undefined,
    };
    if (next.reason || next.other) {
      setErrors(next);
      document.getElementById(next.reason ? `${reasonName}-${CLOSING_DISMISSAL_REASONS[0]}` : otherId)?.focus();
      return;
    }
    if (reasonCode === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await dismissClosingItem(token, {
        section,
        appointmentId,
        ...(planItemId ? { planItemId } : {}),
        reasonCode,
        ...(reasonCode === 'OTHER' ? { reasonText: trimmed } : {}),
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onStale();
        return;
      }
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
      description={copy.description(subject)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      cancelLabel={copy.back}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <RadioGroup
        id={reasonName}
        legend={copy.reason}
        value={reasonCode ?? undefined}
        onValueChange={(code) => {
          setReasonCode(code as ClosingDismissalReason);
          setErrors({});
        }}
        error={errors.reason}
        disabled={submitting}
        optionsClassName="gap-2"
      >
        {CLOSING_DISMISSAL_REASONS.map((code) => (
          <RadioOption
            key={code}
            // El primero lleva el foco cuando falta el motivo.
            id={`${reasonName}-${code}`}
            value={code}
            label={CLOSING_DISMISSAL_REASON_LABELS[code]}
          />
        ))}
      </RadioGroup>

      {reasonCode === 'OTHER' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={otherId}>{copy.other}</Label>
          <Textarea
            id={otherId}
            rows={2}
            // El tope real es de caracteres (lo valida el envío); este solo
            // corta pegados enormes (un emoji ocupa dos unidades UTF-16).
            maxLength={DISMISSAL_TEXT_MAX * 2}
            value={text}
            disabled={submitting}
            aria-invalid={errors.other ? true : undefined}
            aria-describedby={errors.other ? `${fieldErrorId(otherId)} ${counterId}` : counterId}
            onChange={(e) => {
              setText(e.target.value);
              setErrors((x) => ({ ...x, other: undefined }));
            }}
          />
          <p id={counterId} className="self-end text-xs tabular-nums text-muted">
            {copy.counter(chars(text))}
          </p>
          {errors.other ? (
            <InlineError id={fieldErrorId(otherId)} className="text-xs">
              {errors.other}
            </InlineError>
          ) : null}
        </div>
      ) : null}
    </FormModal>
  );
}

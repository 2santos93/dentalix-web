'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  changeOrthoCaseStatus,
  type OrthoCase,
  type OrthoCaseStatus,
  type OrthoClosingStatus,
} from '@/lib/ortho/ortho-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const orthoStatusDialogCopy = {
  title: 'Cambiar estado del caso',
  description:
    'Finalizado o abandonado cierra el caso: ya no se edita ni admite controles. En retención sigue admitiendo controles.',
  status: 'Nuevo estado',
  options: {
    RETENTION: 'En retención',
    FINISHED: 'Finalizado',
    ABANDONED: 'Abandonado',
  } satisfies Record<OrthoClosingStatus, string>,
  reason: 'Motivo',
  reasonRequired: 'Motivo (obligatorio al abandonar)',
  reasonMissing: 'Escribe el motivo del abandono (al menos 3 caracteres).',
  submit: 'Cambiar estado',
  genericError: 'No pudimos cambiar el estado del caso. Intenta de nuevo.',
};
const copy = orthoStatusDialogCopy;

/** Qué estados se ofrecen desde el actual (las mismas transiciones que la API). */
export function nextStatuses(from: OrthoCaseStatus): OrthoClosingStatus[] {
  if (from === 'ACTIVE') return ['RETENTION', 'FINISHED', 'ABANDONED'];
  if (from === 'RETENTION') return ['FINISHED', 'ABANDONED'];
  return [];
}

export function OrthoStatusDialog({
  open,
  onOpenChange,
  token,
  orthoCase,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  orthoCase: OrthoCase;
  onChanged: (updated: OrthoCase) => void;
}) {
  const ids = useId();
  const options = nextStatuses(orthoCase.status);
  const [status, setStatus] = useState<OrthoClosingStatus>(options[0] ?? 'FINISHED');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'ABANDONED' && reason.trim().length < 3) {
      setReasonError(copy.reasonMissing);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    setError(null);
    try {
      const updated = await changeOrthoCaseStatus(token, orthoCase.patientId, orthoCase.id, {
        status,
        reason: reason.trim() || undefined,
      });
      onOpenChange(false);
      onChanged(updated);
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
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      fullScreenOnMobile={false}
    >
      <FormField htmlFor={`${ids}-status`} label={copy.status}>
        <NativeSelect
          id={`${ids}-status`}
          value={status}
          onChange={(e) => setStatus(e.target.value as OrthoClosingStatus)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {copy.options[o]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField
        htmlFor={`${ids}-reason`}
        label={status === 'ABANDONED' ? copy.reasonRequired : copy.reason}
        error={reasonError}
      >
        <Textarea
          id={`${ids}-reason`}
          rows={2}
          autoGrow
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}

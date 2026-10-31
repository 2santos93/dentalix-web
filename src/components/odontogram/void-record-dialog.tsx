'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { VOID_REASON_MAX, voidToothRecord } from '@/lib/odontogram/odontogram-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  title: 'Anular registro',
  description: (what: string) =>
    `Vas a anular «${what}». Deja de pintarse en la carta y queda tachado en el historial con el motivo, tu nombre y la fecha de hoy. No se borra.`,
  reasonLabel: 'Motivo',
  reasonHint: 'Por ejemplo: «registrado en el diente equivocado».',
  reasonRequired: 'Escribe el motivo de la anulación.',
  submit: 'Anular registro',
  genericError: 'No pudimos anular el registro. Intenta de nuevo.',
};

interface VoidRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  recordId: string;
  /** Qué se anula, ya legible (p. ej. «Caries del 01/10/2026»). */
  recordLabel: string;
  onVoided: () => void;
}

/**
 * Anular un registro del odontograma con motivo (DX-120). El motivo es
 * obligatorio; autor y fecha los pone el servidor. Se monta solo mientras
 * está abierto, así que cada apertura empieza vacía. Si la API lo rechaza
 * (403 de otro autor, 409 ya anulado) el mensaje queda en el diálogo.
 */
export function VoidRecordDialog({
  open,
  onOpenChange,
  token,
  patientId,
  recordId,
  recordLabel,
  onVoided,
}: VoidRecordDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = reason.trim();
    setError(null);
    if (clean === '') {
      setReasonError(copy.reasonRequired);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      await voidToothRecord(token, patientId, recordId, clean);
      onOpenChange(false);
      onVoided();
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
      description={copy.description(recordLabel)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      destructive
    >
      <FormField htmlFor="void-reason" label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError}>
        <Textarea
          id="void-reason"
          name="reason"
          rows={3}
          aria-required="true"
          maxLength={VOID_REASON_MAX}
          value={reason}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId('void-reason') : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}

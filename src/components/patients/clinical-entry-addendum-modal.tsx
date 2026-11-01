'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  ADDENDUM_REASON_MAX,
  ADDENDUM_REASON_MIN,
  ADDENDUM_TEXT_MAX,
  createClinicalEntryAddendum,
  type ClinicalEntryAddendum,
} from '@/lib/patients/clinical-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  title: 'Añadir adenda',
  description: (entryDate: string) =>
    `Corrige o aclara la evolución del ${entryDate}. La evolución original no cambia: la adenda queda debajo, con tu nombre y la fecha de hoy.`,
  reasonLabel: 'Motivo de la corrección',
  reasonHint: `Por ejemplo: «pieza dental mal transcrita». Mínimo ${ADDENDUM_REASON_MIN} caracteres.`,
  textLabel: 'Texto de la adenda',
  submit: 'Guardar adenda',
  reasonTooShort: `El motivo debe tener al menos ${ADDENDUM_REASON_MIN} caracteres.`,
  textRequired: 'Escribe el texto de la adenda.',
  genericError: 'No pudimos guardar la adenda. Intenta de nuevo.',
};

interface ClinicalEntryAddendumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  entryId: string;
  /** Fecha de atención ya formateada, para nombrar la evolución. */
  entryDateLabel: string;
  onCreated: (addendum: ClinicalEntryAddendum) => void;
}

/**
 * Modal para añadir una adenda (DX-038: la evolución no se reescribe). Pide motivo y
 * texto; autor y fecha los pone el servidor. Se monta solo mientras está
 * abierto, así que cada apertura empieza con el formulario vacío.
 */
export function ClinicalEntryAddendumModal({
  open,
  onOpenChange,
  token,
  patientId,
  entryId,
  entryDateLabel,
  onCreated,
}: ClinicalEntryAddendumModalProps) {
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    const cleanText = text.trim();
    const nextReasonError =
      cleanReason.length < ADDENDUM_REASON_MIN ? copy.reasonTooShort : null;
    const nextTextError = cleanText === '' ? copy.textRequired : null;
    setReasonError(nextReasonError);
    setTextError(nextTextError);
    setError(null);
    if (nextReasonError || nextTextError) return;

    setSubmitting(true);
    try {
      const created = await createClinicalEntryAddendum(token, patientId, entryId, {
        reason: cleanReason,
        text: cleanText,
      });
      onCreated(created);
      onOpenChange(false);
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
      description={copy.description(entryDateLabel)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      <FormField
        htmlFor="addendum-reason"
        label={copy.reasonLabel}
        hint={copy.reasonHint}
        error={reasonError}
      >
        <Input
          id="addendum-reason"
          name="reason"
          type="text"
          aria-required="true"
          maxLength={ADDENDUM_REASON_MAX}
          value={reason}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId('addendum-reason') : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
      <FormField htmlFor="addendum-text" label={copy.textLabel} error={textError}>
        <Textarea
          id="addendum-text"
          autoGrow
          name="text"
          rows={4}
          aria-required="true"
          maxLength={ADDENDUM_TEXT_MAX}
          value={text}
          aria-invalid={textError ? true : undefined}
          aria-describedby={textError ? fieldErrorId('addendum-text') : undefined}
          onChange={(e) => setText(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}

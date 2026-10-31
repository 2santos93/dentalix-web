'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { voidPatientDocument, type PatientDocument } from '@/lib/patient-documents/patient-documents-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  title: 'Anular documento',
  description: (name: string) =>
    `«${name}» no se borra: queda tachado en la ficha con el motivo, quién lo anuló y cuándo. Si hace falta, sube el correcto.`,
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: paciente equivocado, archivo duplicado, categoría errónea.',
  submit: 'Anular documento',
  genericError: 'No pudimos anular el documento. Intenta de nuevo.',
};

interface VoidDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  document: PatientDocument;
  onVoided: (doc: PatientDocument) => void;
}

/** Anulación con motivo obligatorio (DX-151). El padre lo monta con `key`. */
export function VoidDocumentModal({ open, onOpenChange, token, document, onVoided }: VoidDocumentModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 3;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tooShort) return;
    setSubmitting(true);
    setError(null);
    try {
      const voided = await voidPatientDocument(token, document.patientId, document.id, reason.trim());
      onOpenChange(false);
      onVoided(voided);
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
      description={copy.description(document.originalName)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={tooShort}
      error={error}
      destructive
    >
      <FormField htmlFor="document-void-reason" label={copy.reasonLabel} hint={copy.reasonHint}>
        <Textarea
          autoGrow
          id="document-void-reason"
          rows={3}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}

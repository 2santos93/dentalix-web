'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { voidPrescription, type Prescription } from '@/lib/prescriptions/prescriptions-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Anular receta',
  description:
    'La receta no se borra: queda tachada en la ficha con el motivo, quién la anuló y cuándo. Si hace falta, emite una nueva.',
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: dosis equivocada, cambio de tratamiento.',
  submit: 'Anular receta',
  genericError: 'No pudimos anular la receta. Intenta de nuevo.',
};

interface VoidPrescriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  prescriptionId: string;
  onVoided: (prescription: Prescription) => void;
}

/** Anulación con motivo obligatorio (DX-013). El padre lo monta con `key`. */
export function VoidPrescriptionModal({
  open,
  onOpenChange,
  token,
  prescriptionId,
  onVoided,
}: VoidPrescriptionModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reason.trim() === '') return;
    setSubmitting(true);
    setError(null);
    try {
      const voided = await voidPrescription(token, prescriptionId, reason.trim());
      onOpenChange(false);
      onVoided(voided);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
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
      submitDisabled={reason.trim() === ''}
      error={error}
      destructive
    >
      <FormField htmlFor="rx-void-reason" label={copy.reasonLabel} hint={copy.reasonHint}>
        <textarea
          id="rx-void-reason"
          rows={3}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          className={cn(fieldClass, 'h-auto font-[inherit]')}
        />
      </FormField>
    </FormModal>
  );
}

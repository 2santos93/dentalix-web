'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { voidImplant, type PatientImplant } from '@/lib/implants/implants-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Anular implante',
  description:
    'El registro no se borra: queda tachado en la ficha y marcado como anulado en la tarjeta, con el motivo, quién lo anuló y cuándo. Si hace falta, registra el correcto.',
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: lote mal transcrito, diente equivocado.',
  submit: 'Anular implante',
  genericError: 'No pudimos anular el implante. Intenta de nuevo.',
};

interface VoidImplantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  implantId: string;
  onVoided: (implant: PatientImplant) => void;
}

/** Anulación con motivo obligatorio (DX-191). El padre lo monta con `key`. */
export function VoidImplantModal({
  open,
  onOpenChange,
  token,
  implantId,
  onVoided,
}: VoidImplantModalProps) {
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
      const voided = await voidImplant(token, implantId, reason.trim());
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
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={tooShort}
      error={error}
      destructive
    >
      <FormField htmlFor="implant-void-reason" label={copy.reasonLabel} hint={copy.reasonHint}>
        <textarea
          id="implant-void-reason"
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

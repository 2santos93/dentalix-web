'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cancelLabOrder, LAB_LIMITS as L, labOrderNumberLabel, type LabOrder } from '@/lib/lab-orders/lab-orders-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

export const cancelLabOrderCopy = {
  title: (n: string) => `Anular la orden ${n}`,
  description:
    'No se borra: queda anulada en la ficha con el motivo, quién la anuló y cuándo. Si el trabajo sigue haciendo falta, crea una orden nueva.',
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: el paciente pospuso el tratamiento.',
  reasonTooShort: `Escribe el motivo (al menos ${L.cancelReasonMin} caracteres).`,
  submit: 'Anular orden',
  genericError: 'No pudimos anular la orden. Intenta de nuevo.',
};

const copy = cancelLabOrderCopy;

interface CancelLabOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  order: LabOrder;
  onCancelled: (order: LabOrder) => void;
}

/** Anulación con motivo obligatorio (DX-017): DENTIST y ADMIN; una revisada ya no se anula (409). */
export function CancelLabOrderDialog({ open, onOpenChange, token, order, onCancelled }: CancelLabOrderDialogProps) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < L.cancelReasonMin) {
      setReasonError(copy.reasonTooShort);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    setError(null);
    try {
      const cancelled = await cancelLabOrder(token, order.id, trimmed);
      onOpenChange(false);
      onCancelled(cancelled);
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
      title={copy.title(labOrderNumberLabel(order.number))}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={reason.trim() === ''}
      error={error}
      destructive
      ownValidation
      fullScreenOnMobile={false}
    >
      <FormField htmlFor={reasonId} label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError}>
        <Textarea
          id={reasonId}
          rows={3}
          autoGrow
          value={reason}
          maxLength={L.cancelReasonMax}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId(reasonId) : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
        />
      </FormField>
    </FormModal>
  );
}

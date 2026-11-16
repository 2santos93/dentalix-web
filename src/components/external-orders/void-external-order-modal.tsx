'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_ORDER_LIMITS as L,
  voidExternalOrder,
  type ExternalOrder,
} from '@/lib/external-orders/external-orders-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

export const voidExternalOrderCopy = {
  title: 'Anular orden',
  description: (number: string) =>
    `Orden nº ${number}. No se borra: queda anulada en la ficha con el motivo, quién la anuló y cuándo, y su PDF archivado sale con «ANULADA». El enlace enviado al paciente deja de servir. Si hace falta, emite una nueva.`,
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: se pidió el estudio equivocado.',
  reasonTooShort: `Escribe el motivo (al menos ${L.voidReasonMin} caracteres).`,
  submit: 'Anular orden',
  genericError: 'No pudimos anular la orden. Intenta de nuevo.',
};

const copy = voidExternalOrderCopy;

interface VoidExternalOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  order: ExternalOrder;
  onVoided: (order: ExternalOrder) => void;
}

/**
 * Anulación con motivo obligatorio (DX-572): un ADMIN o quien la emitió, y solo
 * una emitida sin resultado. La API lo vuelve a comprobar (403, 409 «desliga el
 * resultado antes de anularla»): llega en el banner del formulario (escalón 4).
 */
export function VoidExternalOrderModal({ open, onOpenChange, token, order, onVoided }: VoidExternalOrderModalProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = 'external-order-void-reason';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < L.voidReasonMin) {
      setReasonError(copy.reasonTooShort);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    setError(null);
    try {
      const voided = await voidExternalOrder(token, order.id, trimmed);
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
      description={copy.description(order.numberLabel)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={reason.trim() === ''}
      error={error}
      destructive
      ownValidation
    >
      <FormField htmlFor={reasonId} label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError}>
        <Textarea
          id={reasonId}
          rows={3}
          autoGrow
          value={reason}
          maxLength={L.voidReasonMax}
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

'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_INVOICE_NUMBER_MAX,
  saveExternalInvoiceNumber,
  type ExternalInvoiceNumberResult,
} from '@/lib/payments/receipt-settings-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

export const externalInvoiceCopy = {
  action: 'Factura externa',
  title: 'Nº de la factura fiscal',
  description:
    'Si emitiste la factura de este abono fuera de Dentalix, anota su número para encontrarla después. El recibo de caja ya emitido no cambia.',
  label: 'Nº de factura',
  hint: `Tal como figura en la factura, sin formato fijo. Déjalo vacío para quitarlo. Hasta ${EXTERNAL_INVOICE_NUMBER_MAX} caracteres.`,
  oneLine: 'Escribe el número en una sola línea.',
  submit: 'Guardar',
  saved: (value: string | null) => (value ? `Factura externa ${value} anotada.` : 'Nº de factura externa quitado.'),
  splitSaved: (n: number) => `Anotada en las ${n} formas de pago del cobro.`,
  saveError: 'No pudimos guardar el nº de factura. Intenta de nuevo.',
  /** Bajo el recibo o la referencia de una fila. */
  inline: (value: string) => `Fact. ${value}`,
};

const copy = externalInvoiceCopy;

/** El abono cuyo nº se edita: id, cómo se nombra y el nº que ya tiene. */
export interface ExternalInvoiceTarget {
  paymentId: string;
  /** «PRI-000001 · 150,00 USD», en el diálogo. */
  subject: string;
  externalInvoiceNumber: string | null;
}

interface ExternalInvoiceModalProps {
  token: string;
  target: ExternalInvoiceTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: ExternalInvoiceNumberResult) => void;
}

/**
 * DX-515: anotar en un abono el nº de la factura fiscal que la clínica
 * emitió fuera de Dentalix. Texto libre (sin formato por país); ADMIN y
 * recepción. Se monta con una `key` por abono para empezar con su valor.
 */
export function ExternalInvoiceModal({ token, target, onOpenChange, onSaved }: ExternalInvoiceModalProps) {
  const fieldId = useId();
  const [value, setValue] = useState(target?.externalInvoiceNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    if (/[\r\n]/.test(value)) {
      setFieldError(copy.oneLine);
      return;
    }
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const result = await saveExternalInvoiceNumber(token, target.paymentId, value.trim() || null);
      toast.success(
        result.paymentIds.length > 1
          ? `${copy.saved(result.externalInvoiceNumber)} ${copy.splitSaved(result.paymentIds.length)}`
          : copy.saved(result.externalInvoiceNumber),
      );
      onSaved(result);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.saveError);
      if (err instanceof ApiError && err.status === 400) setFieldError(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={target !== null}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={saving}
      error={error}
    >
      {target ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink tabular-nums">
          {target.subject}
        </p>
      ) : null}
      <FormField htmlFor={fieldId} label={copy.label} hint={copy.hint} hintId={`${fieldId}-hint`} error={fieldError}>
        <Input
          id={fieldId}
          name="externalInvoiceNumber"
          autoComplete="off"
          maxLength={EXTERNAL_INVOICE_NUMBER_MAX}
          value={value}
          disabled={saving}
          onChange={(e) => {
            setValue(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(fieldId) : `${fieldId}-hint`}
          className="font-mono"
        />
      </FormField>
    </FormModal>
  );
}

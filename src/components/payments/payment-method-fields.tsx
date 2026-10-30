'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { PAYMENT_REFERENCE_DUPLICATE, type ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import type { RecordPaymentInput } from '@/lib/payments/payments-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { usePaymentMethods, type PaymentMethodsState } from './use-payment-methods';

// Copy como constantes (i18n-ready).
export const paymentMethodFieldsCopy = {
  method: 'Método',
  methodNone: 'Sin especificar',
  methodsLoading: 'Cargando medios de pago…',
  methodsError: 'No pudimos cargar los medios de pago.',
  methodsRetry: 'Reintentar',
  reference: 'Referencia',
  referenceRequired: 'Referencia (obligatoria)',
  referenceHint: 'El número de operación que da el pagador.',
  referenceMissing: 'Este medio de pago pide la referencia del pago.',
  duplicateReason: 'Motivo para registrarla igualmente',
  duplicateReasonHint: 'Queda guardado con el abono y en la auditoría.',
  duplicateReasonMissing: 'Escribe el motivo para registrar la referencia repetida.',
  duplicateSubmit: 'Registrar igualmente',
  duplicateFallback:
    'Esta referencia ya se usó con este medio de pago en otro abono reciente. Revisa el pago o confirma con un motivo.',
};
const copy = paymentMethodFieldsCopy;

const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

type MethodBody = Pick<RecordPaymentInput, 'paymentMethodId' | 'reference' | 'duplicateReferenceReason'>;

export interface PaymentMethodFieldsState {
  methods: PaymentMethodsState;
  selected: ClinicPaymentMethod | null;
  paymentMethodId: string;
  reference: string;
  referenceError: string | null;
  /** Mensaje del 409 de referencia repetida; con él se pide el motivo. */
  duplicate: string | null;
  duplicateReason: string;
  /** DX-395: el motivo que falta, junto a su campo. */
  duplicateReasonError: string | null;
  /**
   * DX-395: el campo que debe recibir el foco (la referencia o el motivo que
   * faltan, o el motivo al llegar el aviso de repetida). `seq` cambia en cada
   * petición, para volver a enfocar el mismo campo.
   */
  focusRequest: { field: 'reference' | 'reason'; seq: number } | null;
  selectMethod: (id: string) => void;
  setReference: (value: string) => void;
  setDuplicateReason: (value: string) => void;
  /** Vacía el medio, la referencia y el aviso (cada apertura del formulario). */
  reset: () => void;
  /**
   * Antes de enviar: `false` si falta la referencia o el motivo de la
   * repetida. El error va junto a su campo (`aria-invalid`) y el campo recibe
   * el foco (DX-395).
   */
  validate: () => boolean;
  /** Lo que se añade al cuerpo del abono. */
  body: () => MethodBody;
  /** `true` si el error es el 409 de referencia repetida (ya avisado). */
  catchDuplicate: (err: unknown) => boolean;
}

/**
 * DX-377: el medio de pago de la clínica, la referencia y el aviso de
 * referencia repetida de un formulario de abono («Registrar abono» y el de la
 * pestaña del plan de tratamiento): un único sitio con la regla.
 */
export function usePaymentMethodFields(token: string, enabled: boolean): PaymentMethodFieldsState {
  const methods = usePaymentMethods(token, enabled);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [reference, setReferenceValue] = useState('');
  const [duplicateReason, setDuplicateReason] = useState('');
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [duplicateReasonError, setDuplicateReasonError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<PaymentMethodFieldsState['focusRequest']>(null);
  const requestFocus = (field: 'reference' | 'reason') =>
    setFocusRequest((prev) => ({ field, seq: (prev?.seq ?? 0) + 1 }));
  const selected = methods.methods.find((m) => m.id === paymentMethodId) ?? null;

  // Cambiar el medio o la referencia retira el aviso de repetida.
  function clearDuplicate() {
    setReferenceError(null);
    setDuplicate(null);
    setDuplicateReason('');
    setDuplicateReasonError(null);
  }

  return {
    methods,
    selected,
    paymentMethodId,
    reference,
    referenceError,
    duplicate,
    duplicateReason,
    duplicateReasonError,
    focusRequest,
    selectMethod: (id) => {
      setPaymentMethodId(id);
      clearDuplicate();
    },
    setReference: (value) => {
      setReferenceValue(value);
      clearDuplicate();
    },
    setDuplicateReason: (value) => {
      setDuplicateReason(value);
      setDuplicateReasonError(null);
    },
    reset: () => {
      setPaymentMethodId('');
      setReferenceValue('');
      clearDuplicate();
      setFocusRequest(null);
    },
    validate: () => {
      if (selected?.requiresReference && reference.trim() === '') {
        setReferenceError(copy.referenceMissing);
        requestFocus('reference');
        return false;
      }
      if (duplicate && duplicateReason.trim() === '') {
        setDuplicateReasonError(copy.duplicateReasonMissing);
        requestFocus('reason');
        return false;
      }
      return true;
    },
    body: () => {
      const trimmed = reference.trim();
      const reason = duplicateReason.trim();
      return {
        ...(selected ? { paymentMethodId: selected.id } : {}),
        ...(selected && trimmed ? { reference: trimmed } : {}),
        ...(duplicate && reason ? { duplicateReferenceReason: reason } : {}),
      };
    },
    catchDuplicate: (err) => {
      if (!(err instanceof ApiError) || err.code !== PAYMENT_REFERENCE_DUPLICATE) return false;
      setDuplicate(apiErrorMessage(err, copy.duplicateFallback));
      // DX-395: el aviso pide el motivo: el foco va a él.
      requestFocus('reason');
      return true;
    },
  };
}

/** El selector de medios activos (con carga y error con reintento). */
export function PaymentMethodSelect({
  fields,
  id,
  label = copy.method,
  disabled,
}: {
  fields: PaymentMethodFieldsState;
  id: string;
  label?: string;
  disabled?: boolean;
}) {
  const { methods } = fields;
  return (
    <FormField htmlFor={id} label={label}>
      {methods.status === 'error' ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
          {copy.methodsError}
          <button type="button" className="font-medium underline" onClick={methods.retry}>
            {copy.methodsRetry}
          </button>
        </p>
      ) : (
        <select
          id={id}
          value={fields.paymentMethodId}
          disabled={disabled || methods.status === 'loading'}
          onChange={(e) => fields.selectMethod(e.target.value)}
          className={fieldClass}
        >
          <option value="">{methods.status === 'loading' ? copy.methodsLoading : copy.methodNone}</option>
          {methods.methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

/**
 * La referencia (si hay medio) y, tras el 409, el aviso con el motivo. Sin
 * `required` nativo: el formulario valida con sus propios mensajes en español
 * (DX-395), y `aria-required` sigue diciendo que el campo es obligatorio.
 */
export function PaymentReferenceFields({ fields, idPrefix }: { fields: PaymentMethodFieldsState; idPrefix: string }) {
  const { selected, referenceError, duplicate, duplicateReasonError, focusRequest } = fields;
  const referenceRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const referenceId = `${idPrefix}-reference`;
  const referenceHintId = `${referenceId}-hint`;
  const reasonId = `${idPrefix}-duplicate-reason`;
  const reasonHintId = `${reasonId}-hint`;

  // DX-395: el foco va al campo que falta (o al motivo que pide el aviso de
  // repetida), ya montado tras el render que lo pidió.
  useEffect(() => {
    if (!focusRequest) return;
    (focusRequest.field === 'reference' ? referenceRef : reasonRef).current?.focus();
  }, [focusRequest]);

  return (
    <>
      {selected ? (
        <FormField
          htmlFor={referenceId}
          label={selected.requiresReference ? copy.referenceRequired : copy.reference}
          hint={copy.referenceHint}
          hintId={referenceHintId}
          error={referenceError}
        >
          <Input
            id={referenceId}
            ref={referenceRef}
            value={fields.reference}
            maxLength={60}
            autoComplete="off"
            aria-required={selected.requiresReference || undefined}
            onChange={(e) => fields.setReference(e.target.value)}
            aria-invalid={referenceError ? true : undefined}
            aria-describedby={referenceError ? fieldErrorId(referenceId) : referenceHintId}
            className="font-mono"
          />
        </FormField>
      ) : null}
      {duplicate ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm text-ink">{duplicate}</p>
          <FormField
            htmlFor={reasonId}
            label={copy.duplicateReason}
            hint={copy.duplicateReasonHint}
            hintId={reasonHintId}
            error={duplicateReasonError}
          >
            <Input
              id={reasonId}
              ref={reasonRef}
              value={fields.duplicateReason}
              maxLength={300}
              onChange={(e) => fields.setDuplicateReason(e.target.value)}
              aria-required
              aria-invalid={duplicateReasonError ? true : undefined}
              aria-describedby={duplicateReasonError ? fieldErrorId(reasonId) : reasonHintId}
            />
          </FormField>
        </div>
      ) : null}
    </>
  );
}

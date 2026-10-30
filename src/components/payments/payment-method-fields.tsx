'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { PAYMENT_REFERENCE_DUPLICATE, type ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import type { RecordPaymentInput } from '@/lib/payments/payments-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/errors/field-error';
import { usePaymentMethods, type PaymentMethodsState } from './use-payment-methods';

// Copy como constantes (i18n-ready).
export const paymentMethodFieldsCopy = {
  method: 'Método',
  methodNone: 'Sin especificar',
  methodsLoading: 'Cargando medios de pago…',
  // FE-082: etiqueta corta del `FieldError` (escalón 2): el contexto lo da la etiqueta del campo.
  methodsError: 'No cargaron los medios',
  methodsRetry: 'Reintentar la carga de los medios de pago',
  methodMissing: 'Elige el medio de pago de esta forma de pago.',
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

/**
 * DX-395: los separadores que la API quita al comparar la referencia
 * (`normalizeReference`: espacios, puntos y guiones, también los tipográficos
 * y el signo menos). Una referencia hecha solo de ellos no es referencia: la
 * API la rechaza con 400, así que el campo la marca como vacía antes.
 */
const REFERENCE_SEPARATORS = /[\s.\-\u2010-\u2015\u2212]+/g;

/** `true` si la referencia no tiene nada que comparar (vacía o solo separadores). */
export function isBlankReference(value: string): boolean {
  return value.replace(REFERENCE_SEPARATORS, '') === '';
}

/**
 * DX-390: la referencia como la compara la API (`normalizeReference`: sin
 * separadores y en mayúsculas), o `null` si no hay nada que comparar.
 */
export function comparableReference(value: string): string | null {
  const normalized = value.replace(REFERENCE_SEPARATORS, '').toUpperCase();
  return normalized === '' ? null : normalized;
}

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
  /** DX-390: el medio que falta, junto a su selector. */
  methodError: string | null;
  /**
   * DX-395: el campo que debe recibir el foco (la referencia o el motivo que
   * faltan, o el motivo al llegar el aviso de repetida). `seq` cambia en cada
   * petición, para volver a enfocar el mismo campo.
   */
  focusRequest: {
    field: 'reference' | 'reason' | 'method';
    seq: number;
  } | null;
  selectMethod: (id: string) => void;
  setReference: (value: string) => void;
  setDuplicateReason: (value: string) => void;
  /** Vacía el medio, la referencia y el aviso (cada apertura del formulario). */
  reset: () => void;
  /**
   * Antes de enviar: `false` si falta la referencia o el motivo de la
   * repetida (o, con `requireMethod`, el medio: DX-390). El error va junto a
   * su campo (`aria-invalid`) y el campo recibe el foco (DX-395).
   */
  validate: (options?: { requireMethod?: boolean }) => boolean;
  /**
   * DX-390: marca la referencia con un error que se ve antes de enviar (p. ej.
   * la misma en dos formas de pago del cobro), con el foco en ella.
   */
  markReference: (message: string) => void;
  /** Lo que se añade al cuerpo del abono. */
  body: () => MethodBody;
  /** `true` si el error es el 409 de referencia repetida (ya avisado). */
  catchDuplicate: (err: unknown) => boolean;
}

/**
 * El estado de los campos de medio y referencia de UNA forma de pago: el
 * abono suelto lo guarda en su propio estado y el cobro dividido (DX-390), uno
 * por línea.
 */
export interface MethodLineState {
  paymentMethodId: string;
  reference: string;
  referenceError: string | null;
  duplicate: string | null;
  duplicateReason: string;
  duplicateReasonError: string | null;
  /** DX-390: el medio que falta (cada línea de un cobro dividido lleva uno). */
  methodError: string | null;
  focusRequest: PaymentMethodFieldsState['focusRequest'];
}

export const EMPTY_METHOD_LINE: MethodLineState = {
  paymentMethodId: '',
  reference: '',
  referenceError: null,
  duplicate: null,
  duplicateReason: '',
  duplicateReasonError: null,
  methodError: null,
  focusRequest: null,
};

/** Cambiar el medio o la referencia retira el aviso de repetida. */
function withoutDuplicate(state: MethodLineState): MethodLineState {
  return {
    ...state,
    referenceError: null,
    duplicate: null,
    duplicateReason: '',
    duplicateReasonError: null,
  };
}

function withFocus(state: MethodLineState, field: 'reference' | 'reason' | 'method'): MethodLineState {
  return {
    ...state,
    focusRequest: { field, seq: (state.focusRequest?.seq ?? 0) + 1 },
  };
}

/**
 * La regla de los campos de medio y referencia sobre un estado: la usan el
 * abono suelto (`usePaymentMethodFields`) y cada línea del cobro dividido
 * (DX-390), así las dos validan igual. `update` aplica el cambio al estado de
 * quien llama.
 */
export function methodFieldsOf(
  methods: PaymentMethodsState,
  state: MethodLineState,
  update: (change: (state: MethodLineState) => MethodLineState) => void,
): PaymentMethodFieldsState {
  const selected = methods.methods.find((m) => m.id === state.paymentMethodId) ?? null;
  return {
    methods,
    selected,
    paymentMethodId: state.paymentMethodId,
    reference: state.reference,
    referenceError: state.referenceError,
    duplicate: state.duplicate,
    duplicateReason: state.duplicateReason,
    duplicateReasonError: state.duplicateReasonError,
    methodError: state.methodError,
    focusRequest: state.focusRequest,
    selectMethod: (id) =>
      update((s) => ({
        ...withoutDuplicate(s),
        paymentMethodId: id,
        methodError: null,
      })),
    setReference: (value) => update((s) => ({ ...withoutDuplicate(s), reference: value })),
    setDuplicateReason: (value) =>
      update((s) => ({
        ...s,
        duplicateReason: value,
        duplicateReasonError: null,
      })),
    reset: () => update(() => EMPTY_METHOD_LINE),
    validate: ({ requireMethod = false } = {}) => {
      if (requireMethod && !selected) {
        update((s) => withFocus({ ...s, methodError: copy.methodMissing }, 'method'));
        return false;
      }
      if (selected?.requiresReference && isBlankReference(state.reference)) {
        update((s) => withFocus({ ...s, referenceError: copy.referenceMissing }, 'reference'));
        return false;
      }
      if (state.duplicate && state.duplicateReason.trim() === '') {
        update((s) => withFocus({ ...s, duplicateReasonError: copy.duplicateReasonMissing }, 'reason'));
        return false;
      }
      return true;
    },
    markReference: (message) => update((s) => withFocus({ ...s, referenceError: message }, 'reference')),
    body: () => {
      const trimmed = state.reference.trim();
      const reason = state.duplicateReason.trim();
      return {
        ...(selected ? { paymentMethodId: selected.id } : {}),
        ...(selected && trimmed ? { reference: trimmed } : {}),
        ...(state.duplicate && reason ? { duplicateReferenceReason: reason } : {}),
      };
    },
    catchDuplicate: (err) => {
      if (!(err instanceof ApiError) || err.code !== PAYMENT_REFERENCE_DUPLICATE) return false;
      // DX-395: el aviso pide el motivo: el foco va a él.
      update((s) => withFocus({ ...s, duplicate: apiErrorMessage(err, copy.duplicateFallback) }, 'reason'));
      return true;
    },
  };
}

/**
 * DX-377: el medio de pago de la clínica, la referencia y el aviso de
 * referencia repetida de un formulario de abono («Registrar abono» y el de la
 * pestaña del plan de tratamiento): un único sitio con la regla.
 */
export function usePaymentMethodFields(token: string, enabled: boolean): PaymentMethodFieldsState {
  const methods = usePaymentMethods(token, enabled);
  const [state, setState] = useState<MethodLineState>(EMPTY_METHOD_LINE);
  return methodFieldsOf(methods, state, setState);
}

/**
 * El selector de medios activos, con carga y, si no cargan, el escalón 2 de la
 * escalera de errores (FE-082): `FieldError` en el sitio del control, a su
 * altura, con el reintento como destino de la etiqueta. Con `methodError`
 * (DX-390), el error del campo y el foco.
 */
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
  const { methods, methodError, focusRequest } = fields;
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (focusRequest?.field === 'method') selectRef.current?.focus();
  }, [focusRequest]);
  return (
    <FormField htmlFor={id} label={label} error={methodError}>
      {methods.status === 'error' ? (
        <FieldError
          label={copy.methodsError}
          onRetry={methods.retry}
          retryLabel={copy.methodsRetry}
          retryId={id}
          className="h-10 w-full max-sm:h-11"
        />
      ) : (
        <select
          id={id}
          ref={selectRef}
          value={fields.paymentMethodId}
          disabled={disabled || methods.status === 'loading'}
          onChange={(e) => fields.selectMethod(e.target.value)}
          aria-invalid={methodError ? true : undefined}
          aria-describedby={methodError ? fieldErrorId(id) : undefined}
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
export function PaymentReferenceFields({
  fields,
  idPrefix,
  disabled,
}: {
  fields: PaymentMethodFieldsState;
  idPrefix: string;
  /** Mientras se envía el abono (DX-390). */
  disabled?: boolean;
}) {
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
    if (!focusRequest || focusRequest.field === 'method') return;
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
            disabled={disabled}
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
              disabled={disabled}
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

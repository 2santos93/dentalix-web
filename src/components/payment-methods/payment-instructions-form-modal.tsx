'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  savePaymentMethodInstructions,
  type ClinicPaymentMethod,
  type PaymentMethodInstruction,
} from '@/lib/payments/payment-methods-api';
import {
  PAYMENT_INSTRUCTION_FIELDS,
  PAYMENT_INSTRUCTION_LABELS,
  PAYMENT_INSTRUCTION_MAX,
  type PaymentInstructionField,
  type PaymentInstructionValues,
} from '@/lib/payments/payment-instructions';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';

/** El ámbito de unos datos: toda la clínica (`''`) o una sede (su id). */
const CLINIC_SCOPE = '';

export const paymentInstructionsFormCopy = {
  createTitle: 'Añadir datos para pagar',
  editTitle: 'Editar datos para pagar',
  description:
    'Lo que el paciente ve en su enlace de pago para pagarte, con un botón para copiar cada dato. Rellena solo los que apliquen.',
  method: 'Medio de pago',
  scope: 'Para',
  scopeHint: 'Los datos de una sede ganan a los de toda la clínica en los enlaces de esa sede.',
  clinicScope: 'Toda la clínica',
  noMethods: 'Todos los medios activos ya tienen datos para cada sede. Edita los que hay.',
  fieldLabels: { ...PAYMENT_INSTRUCTION_LABELS, note: 'Nota para el paciente' } as Record<PaymentInstructionField, string>,
  notePlaceholder: 'Por ejemplo, «Indica tu nombre en el concepto».',
  phoneHint: 'Con el prefijo, como lo escribe quien paga.',
  needsOne: 'Escribe al menos un dato para pagar.',
  tooLong: (max: number) => `Hasta ${max} caracteres.`,
  oneLine: 'Escríbelo en una sola línea.',
  save: 'Guardar datos',
  genericError: 'No pudimos guardar los datos para pagar. Intenta de nuevo.',
};
const copy = paymentInstructionsFormCopy;

const EMPTY: PaymentInstructionValues = {
  holderName: null,
  holderId: null,
  bankName: null,
  accountNumber: null,
  phone: null,
  email: null,
  note: null,
};

export interface InstructionScopeChoice {
  method: ClinicPaymentMethod;
  /** Ámbitos libres de ese medio: `''` = toda la clínica. */
  scopes: string[];
}

interface PaymentInstructionsFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin `editing`: alta, eligiendo medio y ámbito entre los libres. */
  editing: { method: ClinicPaymentMethod; instruction: PaymentMethodInstruction } | null;
  choices: InstructionScopeChoice[];
  locations: ClinicLocation[];
  onSaved: (paymentMethodId: string, saved: PaymentMethodInstruction) => void;
}

export function scopeLabel(locationId: string | null, locations: ClinicLocation[]): string {
  if (!locationId) return copy.clinicScope;
  return locations.find((l) => l.id === locationId)?.name ?? 'Otra sede';
}

/**
 * DX-569: alta o edición de los datos para pagar de un medio, para toda la
 * clínica o para una sede (solo ADMIN; `PUT` sustituye los de ese ámbito).
 * Al menos un dato; cada uno con el tope de la API y en una línea, salvo la
 * nota. El padre lo monta con una `key` por apertura.
 */
export function PaymentInstructionsFormModal({
  open,
  onOpenChange,
  token,
  editing,
  choices,
  locations,
  onSaved,
}: PaymentInstructionsFormModalProps) {
  const first = choices[0];
  const [methodId, setMethodId] = useState(editing?.method.id ?? first?.method.id ?? '');
  const [scope, setScope] = useState(
    editing ? (editing.instruction.locationId ?? CLINIC_SCOPE) : (first?.scopes[0] ?? CLINIC_SCOPE),
  );
  const [values, setValues] = useState<PaymentInstructionValues>(() => {
    if (!editing) return EMPTY;
    const i = editing.instruction;
    return Object.fromEntries(PAYMENT_INSTRUCTION_FIELDS.map((f) => [f, i[f]])) as PaymentInstructionValues;
  });
  const [errors, setErrors] = useState<Partial<Record<PaymentInstructionField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);

  const choice = choices.find((c) => c.method.id === methodId);
  const scopes = choice?.scopes ?? [];
  const method = editing?.method ?? choice?.method ?? null;

  function validate(): Partial<Record<PaymentInstructionField, string>> {
    const next: Partial<Record<PaymentInstructionField, string>> = {};
    for (const field of PAYMENT_INSTRUCTION_FIELDS) {
      const value = values[field]?.trim() ?? '';
      if (value.length > PAYMENT_INSTRUCTION_MAX[field]) next[field] = copy.tooLong(PAYMENT_INSTRUCTION_MAX[field]);
      else if (field !== 'note' && /[\r\n]/.test(value)) next[field] = copy.oneLine;
    }
    return next;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fieldErrors = validate();
    setErrors(fieldErrors);
    const firstInvalid = PAYMENT_INSTRUCTION_FIELDS.find((f) => fieldErrors[f]);
    if (firstInvalid) {
      document.getElementById(`pmi-${firstInvalid}`)?.focus();
      return;
    }
    if (PAYMENT_INSTRUCTION_FIELDS.every((f) => !(values[f]?.trim() ?? ''))) {
      setFormError(copy.needsOne);
      firstRef.current?.focus();
      return;
    }
    if (!method) return;
    setSubmitting(true);
    try {
      const body = Object.fromEntries(
        PAYMENT_INSTRUCTION_FIELDS.map((f) => [f, values[f]?.trim() ? values[f]!.trim() : null]),
      ) as PaymentInstructionValues;
      const saved = await savePaymentMethodInstructions(token, method.id, {
        locationId: scope === CLINIC_SCOPE ? null : scope,
        ...body,
      });
      onSaved(method.id, saved);
      onOpenChange(false);
    } catch (err) {
      setFormError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function setField(field: PaymentInstructionField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={submitting}
      submitDisabled={!method}
      error={formError}
      touchTargets
    >
      {editing ? (
        <DescriptionList columns={2}>
          <DescriptionItem label={copy.method}>{editing.method.name}</DescriptionItem>
          <DescriptionItem label={copy.scope}>{scopeLabel(editing.instruction.locationId, locations)}</DescriptionItem>
        </DescriptionList>
      ) : choices.length === 0 ? (
        <p className="text-sm text-muted">{copy.noMethods}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pmi-method" label={copy.method}>
            <NativeSelect
              id="pmi-method"
              value={methodId}
              onChange={(e) => {
                const next = choices.find((c) => c.method.id === e.target.value);
                setMethodId(e.target.value);
                setScope(next?.scopes[0] ?? CLINIC_SCOPE);
              }}
            >
              {choices.map((c) => (
                <option key={c.method.id} value={c.method.id}>
                  {c.method.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="pmi-scope" label={copy.scope} hint={copy.scopeHint}>
            <NativeSelect id="pmi-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              {scopes.map((s) => (
                <option key={s || 'clinic'} value={s}>
                  {scopeLabel(s || null, locations)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {PAYMENT_INSTRUCTION_FIELDS.filter((f) => f !== 'note').map((field, index) => {
          const id = `pmi-${field}`;
          const error = errors[field] ?? null;
          return (
            <FormField
              key={field}
              htmlFor={id}
              label={copy.fieldLabels[field]}
              error={error}
              hint={field === 'phone' ? copy.phoneHint : undefined}
            >
              <Input
                id={id}
                ref={index === 0 ? firstRef : undefined}
                value={values[field] ?? ''}
                maxLength={PAYMENT_INSTRUCTION_MAX[field]}
                inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : undefined}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? fieldErrorId(id) : undefined}
                onChange={(e) => setField(field, e.target.value)}
              />
            </FormField>
          );
        })}
      </div>
      <FormField htmlFor="pmi-note" label={copy.fieldLabels.note} error={errors.note ?? null}>
        <Textarea
          id="pmi-note"
          autoGrow
          value={values.note ?? ''}
          maxLength={PAYMENT_INSTRUCTION_MAX.note}
          placeholder={copy.notePlaceholder}
          aria-invalid={errors.note ? true : undefined}
          onChange={(e) => setField('note', e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}

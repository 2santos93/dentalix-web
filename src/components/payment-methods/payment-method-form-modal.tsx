'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  PAYMENT_METHOD_KIND_LABELS,
  PAYMENT_METHOD_KIND_OPTIONS,
  createPaymentMethod,
  updatePaymentMethod,
  type ClinicPaymentMethod,
  type PaymentMethodKind,
} from '@/lib/payments/payment-methods-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';

export const paymentMethodFormCopy = {
  createTitle: 'Nuevo medio de pago',
  editTitle: 'Editar medio de pago',
  description:
    'El nombre es el que ve recepción al registrar un abono. El tipo base agrupa el medio en los informes por método.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Pago móvil',
  kind: 'Tipo base',
  kindLockedHint:
    'Es un medio inicial: su tipo base no cambia. Si necesitas otro tipo, crea un medio nuevo.',
  requiresReference: 'Pide referencia',
  requiresReferenceHint:
    'El abono con este medio exige el número de referencia del pago, y la caja avisa si se repite.',
  create: 'Crear medio',
  save: 'Guardar cambios',
  invalidName: 'Escribe un nombre (hasta 60 caracteres).',
  genericError: 'No pudimos guardar el medio de pago. Intenta de nuevo.',
};
const copy = paymentMethodFormCopy;

interface PaymentMethodFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin medio: alta. Con medio: edición. */
  method?: ClinicPaymentMethod | null;
  onSaved: (method: ClinicPaymentMethod) => void;
}

/**
 * Alta y edición de un medio de pago (DX-377, solo ADMIN). El padre lo monta
 * con una `key` por apertura.
 */
export function PaymentMethodFormModal({
  open,
  onOpenChange,
  token,
  method,
  onSaved,
}: PaymentMethodFormModalProps) {
  const editing = !!method;
  const [name, setName] = useState(method?.name ?? '');
  const [kind, setKind] = useState<PaymentMethodKind>(method?.kind ?? 'DIGITAL');
  const [requiresReference, setRequiresReference] = useState(method?.requiresReference ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  // Un medio inicial lo usan los clientes anteriores por su método: la API no
  // deja cambiar su tipo base (DX-377).
  const kindLocked = !!method?.legacyMethod;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNameError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 60) {
      setNameError(copy.invalidName);
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const input = { name: trimmed, kind, requiresReference };
      const saved = editing
        ? await updatePaymentMethod(token, method.id, input)
        : await createPaymentMethod(token, input);
      onSaved(saved);
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
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <FormField htmlFor="pm-name" label={copy.name} error={nameError}>
        <Input
          id="pm-name"
          ref={nameRef}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? fieldErrorId('pm-name') : undefined}
          value={name}
          maxLength={60}
          placeholder={copy.namePlaceholder}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          // DX-395: sin `required` nativo (su globo sale en el idioma del
          // navegador); el formulario valida con su propio mensaje.
          aria-required
        />
      </FormField>
      <FormField
        htmlFor="pm-kind"
        label={copy.kind}
        hint={kindLocked ? copy.kindLockedHint : undefined}
        hintId={kindLocked ? 'pm-kind-hint' : undefined}
      >
        <NativeSelect
          id="pm-kind"
          value={kind}
          disabled={kindLocked}
          aria-describedby={kindLocked ? 'pm-kind-hint' : undefined}
          onChange={(e) => setKind(e.target.value as PaymentMethodKind)}
        >
          {PAYMENT_METHOD_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {PAYMENT_METHOD_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <Checkbox
        id="pm-requires-reference"
        checked={requiresReference}
        onChange={(e) => setRequiresReference(e.target.checked)}
        label={copy.requiresReference}
        description={copy.requiresReferenceHint}
      />
    </FormModal>
  );
}

'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseDecimalInput } from '@/lib/format/money';
import {
  PAYMENT_METHOD_KIND_LABELS,
  PAYMENT_METHOD_KIND_OPTIONS,
  PAYMENT_PROOF_POLICY_LABELS,
  PAYMENT_PROOF_POLICY_OPTIONS,
  GATEWAY_FEE_MAX,
  createPaymentMethod,
  setPaymentMethodGatewayFee,
  updatePaymentMethod,
  type ClinicPaymentMethod,
  type PaymentMethodKind,
  type PaymentProofPolicy,
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
  // DX-389: «Pide comprobante» del cobro.
  proofPolicy: 'Pide comprobante',
  proofPolicyHint:
    'La captura del pago móvil o de la transferencia que se guarda con el abono. Opcional la admite; Obligatorio no deja registrar el abono sin ella. Solo la ven administración y recepción.',
  // DX-569: el paciente lo ve en su enlace de pago (si tiene datos para pagar).
  allowInPaymentLink: 'Permitir en el enlace de pago',
  allowInPaymentLinkHint:
    'El paciente podrá reportar su pago con este medio desde el enlace que le envíes. Solo se muestra si tiene datos para pagar.',
  // DX-018-bis: lo que la pasarela cobra a la CLÍNICA (no es un ajuste al paciente).
  gatewayFee: 'Comisión de la pasarela (%)',
  gatewayFeeHint:
    'Lo que el banco o la pasarela cobra a la clínica por cada cobro con este medio. No cambia lo que paga el paciente; sirve para descontarlo de los honorarios si la regla lo indica. Vacío si no cobra.',
  gatewayFeeError: 'Escribe un porcentaje mayor que 0 y como mucho 100, con hasta 2 decimales, o déjalo vacío.',
  gatewayFeeSaveError: 'Guardamos el medio de pago, pero no la comisión de la pasarela. Intenta de nuevo.',
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
  const [proofPolicy, setProofPolicy] = useState<PaymentProofPolicy>(method?.proofPolicy ?? 'NONE');
  const [allowInPaymentLink, setAllowInPaymentLink] = useState(method?.allowInPaymentLink ?? false);
  const [gatewayFee, setGatewayFee] = useState(
    method?.gatewayFeePercent == null ? '' : String(method.gatewayFeePercent).replace('.', ','),
  );
  const [gatewayFeeError, setGatewayFeeError] = useState<string | null>(null);
  // Si el medio se guardó y falló la comisión, el reintento edita ese medio (no crea otro).
  const [saved, setSaved] = useState<ClinicPaymentMethod | null>(null);
  const gatewayFeeRef = React.useRef<HTMLInputElement>(null);
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
    let fee: number | null = null;
    if (gatewayFee.trim() !== '') {
      const parsed = parseDecimalInput(gatewayFee, 2);
      if (!parsed.ok || parsed.value <= 0 || parsed.value > GATEWAY_FEE_MAX) {
        setGatewayFeeError(copy.gatewayFeeError);
        gatewayFeeRef.current?.focus();
        return;
      }
      fee = parsed.value;
    }
    setGatewayFeeError(null);
    setSubmitting(true);
    const target = saved ?? method ?? null;
    let current: ClinicPaymentMethod | null = saved;
    try {
      if (!saved) {
        const input = { name: trimmed, kind, requiresReference, proofPolicy, allowInPaymentLink };
        current = target ? await updatePaymentMethod(token, target.id, input) : await createPaymentMethod(token, input);
      }
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
      setSubmitting(false);
      return;
    }
    try {
      if (current && (current.gatewayFeePercent ?? null) !== fee) {
        current = await setPaymentMethodGatewayFee(token, current.id, fee);
      }
      onSaved(current!);
      onOpenChange(false);
    } catch (err) {
      setSaved(current);
      onSaved(current!);
      setError(apiErrorMessage(err, copy.gatewayFeeSaveError));
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
      <FormField htmlFor="pm-proof-policy" label={copy.proofPolicy} hint={copy.proofPolicyHint} hintId="pm-proof-policy-hint">
        <NativeSelect
          id="pm-proof-policy"
          value={proofPolicy}
          aria-describedby="pm-proof-policy-hint"
          onChange={(e) => setProofPolicy(e.target.value as PaymentProofPolicy)}
        >
          {PAYMENT_PROOF_POLICY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_PROOF_POLICY_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <Checkbox
        id="pm-allow-in-payment-link"
        checked={allowInPaymentLink}
        onChange={(e) => setAllowInPaymentLink(e.target.checked)}
        label={copy.allowInPaymentLink}
        description={copy.allowInPaymentLinkHint}
      />
      <FormField
        htmlFor="pm-gateway-fee"
        label={copy.gatewayFee}
        hint={copy.gatewayFeeHint}
        hintId="pm-gateway-fee-hint"
        error={gatewayFeeError}
        className="sm:w-72"
      >
        <Input
          id="pm-gateway-fee"
          ref={gatewayFeeRef}
          inputMode="decimal"
          value={gatewayFee}
          aria-invalid={gatewayFeeError ? true : undefined}
          aria-describedby={gatewayFeeError ? fieldErrorId('pm-gateway-fee') : 'pm-gateway-fee-hint'}
          onChange={(e) => {
            setGatewayFee(e.target.value);
            if (gatewayFeeError) setGatewayFeeError(null);
          }}
        />
      </FormField>
    </FormModal>
  );
}

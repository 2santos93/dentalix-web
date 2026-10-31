'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createPayer, updatePayer, type Payer, type PayerType } from '@/lib/payers/payers-api';
import { PAYER_TYPES, isExternalPayer, payerTypeOf } from '@/lib/payers/payer-type';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PAYER_TYPE_LABELS } from './payer-labels';

const copy = {
  createTitle: 'Nuevo pagador',
  editTitle: 'Editar pagador',
  description:
    'El tipo decide si la cobertura pide el nº de afiliado: todos lo piden salvo «Otro / interno».',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Seguros Horizonte',
  type: 'Tipo',
  typePlaceholder: 'Elige un tipo',
  typeRequired: 'Elige el tipo de pagador.',
  otherHint:
    'Para convenios internos (cortesía, empleados): solo un administrador podrá asignarlos. Una aseguradora o empresa va en su tipo.',
  create: 'Crear pagador',
  save: 'Guardar cambios',
  invalidName: 'El nombre debe tener entre 2 y 120 caracteres.',
  genericError: 'No pudimos guardar el pagador. Intenta de nuevo.',
};

/** id de la pista de SEC-047, para el `aria-describedby` del tipo. */
const TYPE_HINT_ID = 'payer-type-hint';

interface PayerFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sin pagador: alta. Con pagador: edición. */
  payer: Payer | null;
  token: string;
  onSaved: (saved: Payer) => void;
}

/**
 * Alta y edición de un pagador (DX-153). Valida nombre y tipo antes de enviar
 * (la API repite las reglas); el pagador no tiene país (DX-326). El padre lo
 * monta con una `key` por apertura para resembrar el estado.
 */
export function PayerFormModal({ open, onOpenChange, payer, token, onSaved }: PayerFormModalProps) {
  const editing = payer !== null;
  const [name, setName] = useState(payer?.name ?? '');
  // SEC-047: sin tipo por defecto. OTHER marca un pagador interno (sus convenios
  // solo los asigna ADMIN), así que nunca se elige sin querer.
  const [type, setType] = useState<PayerType | ''>(
    payer ? (payerTypeOf(payer.type) ?? '') : '',
  );
  const [typeError, setTypeError] = useState<string | null>(null);
  // La pista de SEC-047 sale con un tipo interno; la misma regla que el resto.
  const internal = type !== '' && !isExternalPayer(type);
  const typeRef = useRef<HTMLSelectElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setTypeError(null);
    if (type === '') {
      setTypeError(copy.typeRequired);
      // El foco va al campo que hay que corregir (WCAG 3.3.1).
      typeRef.current?.focus();
      return;
    }
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 120) return setError(copy.invalidName);

    setSubmitting(true);
    try {
      const saved = editing
        ? await updatePayer(token, payer.id, { name: trimmed, type })
        : await createPayer(token, { name: trimmed, type });
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
      <FormField htmlFor="payer-name" label={copy.name}>
        <Input
          id="payer-name"
          value={name}
          maxLength={120}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField
        htmlFor="payer-type"
        label={copy.type}
        error={typeError}
        hint={internal ? copy.otherHint : undefined}
        hintId={TYPE_HINT_ID}
      >
        <NativeSelect
          id="payer-type"
          ref={typeRef}
          value={type}
          onChange={(e) => {
            setType(e.target.value as PayerType | '');
            setTypeError(null);
          }}
          aria-required
          aria-invalid={typeError ? true : undefined}
          aria-describedby={
            typeError ? fieldErrorId('payer-type') : internal ? TYPE_HINT_ID : undefined
          }
        >
          <option value="" disabled>
            {copy.typePlaceholder}
          </option>
          {PAYER_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAYER_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </FormModal>
  );
}

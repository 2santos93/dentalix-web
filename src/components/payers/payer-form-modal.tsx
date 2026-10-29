'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createPayer, updatePayer, type Payer, type PayerType } from '@/lib/payers/payers-api';
import { normalizePayerType } from '@/lib/payers/legacy-payer-type';
import { PAYER_TYPES } from '@/lib/payers/payer-type';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { PAYER_TYPE_LABELS } from './payer-labels';

const copy = {
  createTitle: 'Nuevo pagador',
  editTitle: 'Editar pagador',
  description:
    'El tipo decide si la cobertura pide el nº de afiliado: todos lo piden salvo «Otro / interno».',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Sanitas',
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

// <select> nativo con el aspecto del átomo Input.
const selectClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

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
 * (la API repite las reglas); el pagador no tiene país (DX-326). El padre lo monta con una `key` por
 * apertura para resembrar el estado.
 */
export function PayerFormModal({ open, onOpenChange, payer, token, onSaved }: PayerFormModalProps) {
  const editing = payer !== null;
  const [name, setName] = useState(payer?.name ?? '');
  // SEC-047: sin tipo por defecto. OTHER marca un pagador interno (sus convenios
  // solo los asigna ADMIN), así que nunca se elige sin querer. Un código de una
  // réplica anterior de la API se siembra como su tipo genérico.
  const [type, setType] = useState<PayerType | ''>(
    payer ? (normalizePayerType(payer.type) ?? '') : '',
  );
  const [typeError, setTypeError] = useState<string | null>(null);
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
        hint={type === 'OTHER' ? copy.otherHint : undefined}
      >
        <select
          id="payer-type"
          ref={typeRef}
          value={type}
          onChange={(e) => {
            setType(e.target.value as PayerType | '');
            setTypeError(null);
          }}
          aria-required
          aria-invalid={typeError ? true : undefined}
          aria-describedby={typeError ? fieldErrorId('payer-type') : undefined}
          className={selectClass}
        >
          <option value="" disabled>
            {copy.typePlaceholder}
          </option>
          {PAYER_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAYER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
    </FormModal>
  );
}

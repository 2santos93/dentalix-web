'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPayer,
  updatePayer,
  type Payer,
  type PayerCountry,
  type PayerType,
} from '@/lib/payers/payers-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { PAYER_COUNTRY_LABELS, PAYER_TYPE_LABELS } from './payer-labels';

const copy = {
  createTitle: 'Nuevo pagador',
  editTitle: 'Editar pagador',
  description:
    'El tipo y el país ordenan la lista. Las mutuas son de España; las EPS y prepagadas, de Colombia.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Sanitas',
  type: 'Tipo',
  typePlaceholder: 'Elige un tipo',
  typeRequired: 'Elige el tipo de pagador.',
  otherHint:
    'Para convenios internos (cortesía, empleados): solo un administrador podrá asignarlos. Una aseguradora o empresa va en su tipo.',
  country: 'País',
  noCountry: '—',
  create: 'Crear pagador',
  save: 'Guardar cambios',
  invalidName: 'El nombre debe tener entre 2 y 120 caracteres.',
  invalidTypeCountry: 'El tipo de pagador no corresponde con el país.',
  genericError: 'No pudimos guardar el pagador. Intenta de nuevo.',
};

const TYPES = Object.keys(PAYER_TYPE_LABELS) as PayerType[];
const COUNTRIES = Object.keys(PAYER_COUNTRY_LABELS) as PayerCountry[];

/** País que exige cada tipo; `null` admite cualquiera (o ninguno). */
const REQUIRED_COUNTRY: Record<PayerType, PayerCountry | null> = {
  MUTUA_ES: 'ES',
  PREPAGADA_CO: 'CO',
  EPS_CO: 'CO',
  EMPRESA: null,
  OTRO: null,
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
 * Alta y edición de un pagador (DX-153). Valida nombre y tipo↔país antes de
 * enviar (la API repite las reglas). El padre lo monta con una `key` por
 * apertura para resembrar el estado.
 */
export function PayerFormModal({ open, onOpenChange, payer, token, onSaved }: PayerFormModalProps) {
  const editing = payer !== null;
  const [name, setName] = useState(payer?.name ?? '');
  // SEC-047: sin tipo por defecto. OTRO marca un pagador interno (sus convenios
  // solo los asigna ADMIN), así que nunca se elige sin querer.
  const [type, setType] = useState<PayerType | ''>(payer?.type ?? '');
  const [typeError, setTypeError] = useState<string | null>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const [country, setCountry] = useState<PayerCountry | ''>(payer?.country ?? '');
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
    const required = REQUIRED_COUNTRY[type];
    if (required !== null && country !== required) return setError(copy.invalidTypeCountry);

    setSubmitting(true);
    try {
      const saved = editing
        ? await updatePayer(token, payer.id, {
            name: trimmed,
            type,
            country: country === '' ? null : country,
          })
        : await createPayer(token, {
            name: trimmed,
            type,
            ...(country === '' ? {} : { country }),
          });
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
        hint={type === 'OTRO' ? copy.otherHint : undefined}
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
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {PAYER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField htmlFor="payer-country" label={copy.country}>
        <select
          id="payer-country"
          value={country}
          onChange={(e) => setCountry(e.target.value as PayerCountry | '')}
          className={selectClass}
        >
          <option value="">{copy.noCountry}</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {PAYER_COUNTRY_LABELS[c]}
            </option>
          ))}
        </select>
      </FormField>
    </FormModal>
  );
}

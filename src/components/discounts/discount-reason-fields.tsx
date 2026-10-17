'use client';
import * as React from 'react';
import {
  DISCOUNT_REASON_LABELS,
  DISCOUNT_REASON_NOTE_MAX,
  DISCOUNT_REASON_OPTIONS,
  type DiscountReasonCode,
} from '@/lib/discounts/discount-rules';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { toolbarFieldClass } from '@/components/shared/list-toolbar';
import { cn } from '@/lib/utils';

export const reasonFieldsCopy = {
  reason: 'Motivo del descuento',
  reasonOptional: 'Motivo del descuento (opcional)',
  choose: 'Elige un motivo',
  requiredHint: (threshold: number) => `Por encima del ${threshold} % el motivo es obligatorio.`,
  note: 'Nota del motivo',
  noteOptional: 'Nota del motivo (opcional)',
  noteHint: 'Sin datos clínicos: solo por qué se descuenta.',
  noteCounter: (n: number) => `${n}/${DISCOUNT_REASON_NOTE_MAX}`,
  reasonRequired: 'Elige el motivo del descuento.',
  noteRequired: `Con el motivo «Otro», escribe una nota (hasta ${DISCOUNT_REASON_NOTE_MAX} caracteres).`,
  noteTooLong: `La nota admite hasta ${DISCOUNT_REASON_NOTE_MAX} caracteres.`,
};

export interface DiscountReasonValue {
  reason: DiscountReasonCode | '';
  note: string;
}

export const EMPTY_REASON: DiscountReasonValue = { reason: '', note: '' };

/**
 * Errores del motivo en español, o null. `required`: el descuento supera el
 * umbral de la política (la API respondería 422).
 */
export function validateDiscountReason(
  value: DiscountReasonValue,
  required: boolean,
): { reason?: string; note?: string } | null {
  const note = value.note.trim();
  if (required && !value.reason) return { reason: reasonFieldsCopy.reasonRequired };
  if (note.length > DISCOUNT_REASON_NOTE_MAX) return { note: reasonFieldsCopy.noteTooLong };
  if (value.reason === 'OTHER' && !note) return { note: reasonFieldsCopy.noteRequired };
  if (note && !value.reason) return { reason: reasonFieldsCopy.reasonRequired };
  return null;
}

/** Lo que va a la API: sin motivo no se manda nada. */
export function reasonPayload(value: DiscountReasonValue): {
  discountReason?: DiscountReasonCode;
  discountReasonNote?: string;
} {
  if (!value.reason) return {};
  const note = value.note.trim();
  return { discountReason: value.reason, ...(note ? { discountReasonNote: note } : {}) };
}

interface DiscountReasonFieldsProps {
  idPrefix: string;
  value: DiscountReasonValue;
  onChange: (value: DiscountReasonValue) => void;
  /** Por encima del umbral: el motivo deja de ser opcional. */
  required: boolean;
  thresholdPercent: number | null;
  errors?: { reason?: string; note?: string } | null;
}

/**
 * Motivo (lista corta) y nota de un descuento (DX-204). Se usa en el
 * formulario del ítem del plan y en «Descuento %». La nota no sale en la
 * auditoría, pero sí en el informe de descuentos: nada clínico.
 */
export function DiscountReasonFields({
  idPrefix,
  value,
  onChange,
  required,
  thresholdPercent,
  errors,
}: DiscountReasonFieldsProps) {
  const reasonId = `${idPrefix}-reason`;
  const noteId = `${idPrefix}-reason-note`;
  return (
    <div className="flex flex-col gap-3">
      <FormField
        htmlFor={reasonId}
        label={required ? reasonFieldsCopy.reason : reasonFieldsCopy.reasonOptional}
        hint={required && thresholdPercent !== null ? reasonFieldsCopy.requiredHint(thresholdPercent) : undefined}
        error={errors?.reason}
      >
        <select
          id={reasonId}
          value={value.reason}
          aria-required={required || undefined}
          aria-invalid={errors?.reason ? true : undefined}
          aria-describedby={errors?.reason ? fieldErrorId(reasonId) : undefined}
          onChange={(e) => onChange({ ...value, reason: e.target.value as DiscountReasonCode | '' })}
          className={cn(toolbarFieldClass, 'w-full')}
        >
          <option value="">{reasonFieldsCopy.choose}</option>
          {DISCOUNT_REASON_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {DISCOUNT_REASON_LABELS[code]}
            </option>
          ))}
        </select>
      </FormField>
      {value.reason ? (
        <FormField
          htmlFor={noteId}
          label={value.reason === 'OTHER' ? reasonFieldsCopy.note : reasonFieldsCopy.noteOptional}
          hint={`${reasonFieldsCopy.noteHint} ${reasonFieldsCopy.noteCounter(value.note.length)}`}
          error={errors?.note}
        >
          <textarea
            id={noteId}
            rows={2}
            value={value.note}
            maxLength={DISCOUNT_REASON_NOTE_MAX}
            aria-invalid={errors?.note ? true : undefined}
            aria-describedby={errors?.note ? fieldErrorId(noteId) : undefined}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            className={cn(toolbarFieldClass, 'h-auto w-full py-2')}
          />
        </FormField>
      ) : null}
    </div>
  );
}

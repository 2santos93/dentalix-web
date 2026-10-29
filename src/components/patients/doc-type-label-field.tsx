'use client';
import * as React from 'react';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { DOC_TYPE_LABEL_MAX } from '@/lib/patients/doc-type';

// Copy as constants (i18n-ready) — es first (DX-327, spec §6.3).
export const docTypeLabelFieldCopy = {
  label: 'Nombre del documento (opcional)',
  hint: 'Si lo escribes, los documentos impresos lo muestran en lugar del tipo.',
  tooLong: `Hasta ${DOC_TYPE_LABEL_MAX} caracteres.`,
};

interface DocTypeLabelFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Campo «Nombre del documento» (R7) de los formularios del paciente y del
 * responsable. Sin `maxLength`: el límite cuenta caracteres, no unidades
 * UTF-16, y lo valida quien lo usa con `docTypeLabelTooLong`.
 */
export function DocTypeLabelField({ id, value, onChange, error, inputRef, className }: DocTypeLabelFieldProps) {
  const hintId = `${id}-hint`;
  return (
    <FormField
      htmlFor={id}
      label={docTypeLabelFieldCopy.label}
      hint={docTypeLabelFieldCopy.hint}
      hintId={hintId}
      error={error}
      className={className}
    >
      <Input
        ref={inputRef}
        id={id}
        name="docTypeLabel"
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : hintId}
        className="max-sm:h-11"
      />
    </FormField>
  );
}

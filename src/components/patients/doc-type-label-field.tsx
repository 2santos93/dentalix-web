'use client';
import * as React from 'react';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { DOC_TYPE_LABEL_MAX, docTypeLabelError } from '@/lib/patients/doc-type';

// Copy as constants (i18n-ready) — es first (DX-327, spec §6.3).
export const docTypeLabelFieldCopy = {
  label: 'Nombre del documento (opcional)',
  hint: 'Si lo escribes, se muestra en lugar del tipo en fichas y documentos.',
  tooLong: `Hasta ${DOC_TYPE_LABEL_MAX} caracteres.`,
  control: 'El nombre del documento no puede llevar caracteres de control.',
};

/**
 * R7: el texto del error que la API daría a este nombre, o null. Con él el
 * 400 de la etiqueta no se alcanza desde la interfaz.
 */
export function docTypeLabelFieldError(raw: string): string | null {
  const error = docTypeLabelError(raw);
  return error ? docTypeLabelFieldCopy[error] : null;
}

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
 * UTF-16, y lo valida quien lo usa con `docTypeLabelFieldError`.
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
      />
    </FormField>
  );
}

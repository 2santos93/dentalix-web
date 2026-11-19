'use client';
import * as React from 'react';
import { callbackCopy } from '@/lib/recall/attempts-presentation';
import { FormField } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';

/**
 * DX-465: «Volver a llamar el» de «Llamar luego». De hoy a 90 días en la sede
 * del paciente (`range`, calculado con su zona); ese día vuelve a la lista.
 * Sin `range` (sede sin zona) el campo sigue y el servidor dice qué falta.
 */
export function RecallCallbackField({
  id,
  value,
  onChange,
  range,
  error,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  range: { min: string; max: string } | null;
  error?: string;
}) {
  return (
    <FormField htmlFor={id} label={callbackCopy.label} hint={callbackCopy.hint} error={error}>
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        min={range?.min}
        max={range?.max}
        aria-invalid={error ? true : undefined}
        className="sm:max-w-56"
      />
    </FormField>
  );
}

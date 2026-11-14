'use client';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * La casilla de una fila de `DataList` (`leading`) para elegir procedimientos:
 * «Actualizar precios» (DX-379 B) y «Aceptar en parte» (DX-417). I-4: la caja
 * mide 20 px en táctil; la etiqueta que la envuelve da los 44 px.
 */
export function RowSelectCell({
  label,
  checked,
  onToggle,
  disabled = false,
  describedBy,
  testId,
}: {
  /** El nombre accesible de la casilla («Actualizar Implante»). */
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  /** El id del texto que explica por qué está deshabilitada. */
  describedBy?: string;
  testId?: string;
}) {
  return (
    <label
      data-testid={testId}
      className={cn(
        '-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center',
        !disabled && 'cursor-pointer',
      )}
    >
      <Checkbox
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </label>
  );
}

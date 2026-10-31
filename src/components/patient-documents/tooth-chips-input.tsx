'use client';
import * as React from 'react';
import { useState } from 'react';
import { X } from 'lucide-react';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

/** Tope de la API: como mucho 8 dientes por documento. */
export const MAX_DOCUMENT_TEETH = 8;

const copy = {
  placeholder: 'Ej. 11',
  hint: 'Escribe el código FDI y pulsa Enter o coma.',
  invalid: (value: string) => `«${value}» no es un código FDI válido.`,
  full: `Como mucho ${MAX_DOCUMENT_TEETH} dientes.`,
  remove: (tooth: string) => `Quitar el diente ${tooth}`,
};

interface ToothChipsInputProps {
  id: string;
  label: string;
  value: string[];
  onChange: (teeth: string[]) => void;
  disabled?: boolean;
  /**
   * `true` mientras lo escrito no es un código FDI válido (se queda en el campo
   * con el error): quien lo usa no debe enviar el formulario así.
   */
  onInvalidChange?: (invalid: boolean) => void;
}

/**
 * Varios dientes FDI como chips (DX-151). El `ToothPicker` del plan elige UNO
 * y pinta la carta entera: en cada fila de la cola sería demasiado. Este acepta
 * «11, 21» tecleados o pegados, valida cada código y descarta repetidos.
 */
export function ToothChipsInput({
  id,
  label,
  value,
  onChange,
  disabled,
  onInvalidChange,
}: ToothChipsInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hintId = `${id}-hint`;

  function showError(message: string | null) {
    setError(message);
    onInvalidChange?.(message !== null);
  }

  function commit(raw: string): boolean {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return true;
    const next = [...value];
    for (const part of parts) {
      if (!isFdiToothNumber(part)) {
        showError(copy.invalid(part));
        return false;
      }
      if (next.includes(part)) continue;
      if (next.length >= MAX_DOCUMENT_TEETH) {
        showError(copy.full);
        return false;
      }
      next.push(part);
    }
    showError(null);
    onChange(next);
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (commit(draft)) setDraft('');
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="t-label text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tooth) => (
          <span
            key={tooth}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas pl-2.5 text-sm tabular-nums text-ink"
          >
            {tooth}
            <button
              type="button"
              disabled={disabled}
              aria-label={copy.remove(tooth)}
              onClick={() => onChange(value.filter((t) => t !== tooth))}
              className="inline-flex size-11 items-center sm:size-8 justify-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          placeholder={copy.placeholder}
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) showError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (commit(draft)) setDraft('');
          }}
          className={cn(fieldClass, 'h-11 w-24 min-w-0 flex-1 tabular-nums sm:h-10 sm:flex-none')}
        />
      </div>
      <p id={hintId} className={cn('text-xs', error ? 'text-danger-text' : 'text-muted')} role={error ? 'alert' : undefined}>
        {error ?? copy.hint}
      </p>
    </div>
  );
}

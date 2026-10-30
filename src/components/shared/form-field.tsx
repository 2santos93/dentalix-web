import * as React from 'react';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';

/** id of a `FormField`'s error message, for the control's `aria-describedby`. */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

/**
 * id of a `FormField`'s label. A control that is not a labelable element (the
 * segmented `DateField`/`DatePicker`/`TimeField` groups) is named with
 * `aria-labelledby={fieldLabelId(htmlFor)}` — the date primitives do it on
 * their own when they get `id`.
 */
export function fieldLabelId(htmlFor: string): string {
  return `${htmlFor}-field-label`;
}

interface FormFieldProps {
  /** id of the control this field labels (ties <Label htmlFor> to the input). */
  htmlFor: string;
  label: string;
  error?: string | null;
  hint?: string;
  /** id of the hint, for the control's `aria-describedby` (e.g. a disabled control's reason). */
  hintId?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Molecule: label + control + hint/error, the standard row for any form.
 * The error carries the id `fieldErrorId(htmlFor)` so the control can point
 * at it with `aria-describedby` (and set `aria-invalid`).
 */
export function FormField({
  htmlFor,
  label,
  error,
  hint,
  hintId,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label id={fieldLabelId(htmlFor)} htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && !error ? <p id={hintId} className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <InlineError id={fieldErrorId(htmlFor)} className="text-xs">
          {error}
        </InlineError>
      ) : null}
    </div>
  );
}

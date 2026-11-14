import * as React from 'react';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';

/** id of a `FormField`'s error message, for the control's `aria-describedby`. */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

/** id of a `FormField`'s hint, for the control's `aria-describedby` (DX-118). */
export function fieldHintId(htmlFor: string): string {
  return `${htmlFor}-hint`;
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
  /**
   * id of the hint. Defaults to `fieldHintId(htmlFor)`; pass one only when the
   * control already points at the hint under another id.
   */
  hintId?: string;
  className?: string;
  children: React.ReactNode;
}

/** The ids a control should be described by: its hint (when shown) and its error (when shown). */
function describedBy(existing: unknown, ids: string[]): string | undefined {
  const tokens = typeof existing === 'string' ? existing.split(/\s+/).filter(Boolean) : [];
  for (const id of ids) if (!tokens.includes(id)) tokens.push(id);
  return tokens.length ? tokens.join(' ') : undefined;
}

type DescribableProps = { id?: unknown; 'aria-describedby'?: unknown };

/**
 * Molecule: label + control + hint/error, the standard row for any form.
 * The error carries the id `fieldErrorId(htmlFor)` so the control can point
 * at it with `aria-describedby` (and set `aria-invalid`).
 *
 * DX-118 (FE-032): the hint is associated too. The control — the direct child
 * whose `id` is `htmlFor` — gets the hint's id and the error's id merged into
 * its `aria-describedby`, so a caller never has to wire them by hand (and a
 * caller that already did gets no duplicates). A control that renders the
 * `id` deeper (a wrapper component) must forward `aria-describedby` to it.
 */
export function FormField({
  htmlFor,
  label,
  error,
  hint,
  hintId = fieldHintId(htmlFor),
  className,
  children,
}: FormFieldProps) {
  const showHint = Boolean(hint) && !error;
  const ids = [...(showHint ? [hintId] : []), ...(error ? [fieldErrorId(htmlFor)] : [])];
  const control = React.Children.map(children, (child) => {
    if (!ids.length || !React.isValidElement<DescribableProps>(child) || child.props.id !== htmlFor) return child;
    return React.cloneElement(child, {
      'aria-describedby': describedBy(child.props['aria-describedby'], ids),
    });
  });
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label id={fieldLabelId(htmlFor)} htmlFor={htmlFor}>
        {label}
      </Label>
      {control}
      {showHint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <InlineError id={fieldErrorId(htmlFor)} className="text-xs">
          {error}
        </InlineError>
      ) : null}
    </div>
  );
}

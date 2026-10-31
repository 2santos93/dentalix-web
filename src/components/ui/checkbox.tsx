'use client';
import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { composeRefs, describedBy } from '@/lib/ui/compose-refs';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { ChoiceControl, ChoiceRow, choiceBoxClass, choiceMarkClass } from './choice';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Visible label. Without it the checkbox is bare and needs `aria-label`/`aria-labelledby`. */
  label?: React.ReactNode;
  /** Secondary line under the label; becomes the checkbox's description. */
  description?: React.ReactNode;
  /** «Some selected»: drawn as a dash, announced as mixed. */
  indeterminate?: boolean;
  /**
   * Validation message (rung 4, `InlineError`) under the row, with the same
   * contract as `FormField`: id `fieldErrorId(id)`, `aria-invalid`,
   * `aria-describedby`.
   */
  error?: string | null;
}

/**
 * A real `<input type="checkbox">` restyled: 16px box (20px on touch), 4px
 * radius, `border-input` boundary, accent fill + check when checked, dash when
 * indeterminate. With `label` the whole row is the target (44px on touch).
 * `className` goes on the row (or on the box when bare).
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { label, description, indeterminate = false, error, className, id, disabled, ...props },
    ref,
  ) => {
    const own = React.useRef<HTMLInputElement | null>(null);
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const labelId = `${inputId}-label`;
    const descriptionId = `${inputId}-description`;
    const errorId = fieldErrorId(inputId);

    React.useEffect(() => {
      if (own.current) own.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const control = (
      <ChoiceControl className={label ? undefined : className}>
        <input
          ref={composeRefs(ref, own)}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          {...props}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy(
            props['aria-describedby'],
            description ? descriptionId : null,
            error ? errorId : null,
          )}
          className={cn(
            choiceBoxClass,
            'rounded-[4px] indeterminate:border-primary indeterminate:bg-primary disabled:indeterminate:border-muted disabled:indeterminate:bg-muted',
          )}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className={cn(choiceMarkClass, 'hidden size-3 text-primary-fg peer-checked:block peer-indeterminate:hidden pointer-coarse:size-3.5')}
        />
        <Minus
          aria-hidden
          strokeWidth={3}
          className={cn(choiceMarkClass, 'hidden size-3 text-primary-fg peer-indeterminate:block pointer-coarse:size-3.5')}
        />
      </ChoiceControl>
    );

    // La estructura no cambia con `error` ni con `description`: el `<input>`
    // es siempre el mismo nodo y no pierde el foco al ganar o perder el error.
    // Sin error, el envoltorio es `display: contents` (no cuenta para el
    // layout del padre); con error, apila la fila y el mensaje.
    const errorLine = error ? (
      <InlineError id={errorId} className="text-xs">
        {error}
      </InlineError>
    ) : null;

    if (!label) {
      return (
        <span className={error ? 'inline-flex flex-col gap-1' : 'contents'}>
          {control}
          {errorLine}
        </span>
      );
    }

    return (
      <div className={error ? cn('flex flex-col gap-1', className) : 'contents'}>
        <ChoiceRow
          control={control}
          label={label}
          labelId={labelId}
          description={description}
          descriptionId={descriptionId}
          disabled={disabled}
          className={error ? undefined : className}
        />
        {errorLine}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';

'use client';
import * as React from 'react';
import { describedBy } from '@/lib/ui/compose-refs';
import { ChoiceControl, ChoiceRow } from './choice';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'role'> {
  /** Visible label. Without it the switch is bare and needs `aria-label`/`aria-labelledby`. */
  label?: React.ReactNode;
  /** Secondary line under the label; becomes the switch's description. */
  description?: React.ReactNode;
}

/**
 * On/off setting that applies at once (a preference, a module toggle). A real
 * `<input type="checkbox" role="switch">`: 36×20 track. Off is a solid
 * `border-input` track (≥3:1, readable at a glance, never a ghost outline);
 * on is the accent. For a choice that is submitted with a form, use `Checkbox`.
 * `className` goes on the row (or on the track when bare).
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, id, disabled, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const labelId = `${inputId}-label`;
    const descriptionId = `${inputId}-description`;

    const control = (
      <ChoiceControl className={label ? undefined : className}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          {...props}
          aria-describedby={describedBy(props['aria-describedby'], description ? descriptionId : null)}
          className="peer m-0 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-border-input transition-colors checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-surface transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-fg peer-disabled:opacity-80 motion-reduce:transition-none"
        />
      </ChoiceControl>
    );

    if (!label) return control;
    return (
      <ChoiceRow
        control={control}
        label={label}
        labelId={labelId}
        description={description}
        descriptionId={descriptionId}
        disabled={disabled}
        className={className}
      />
    );
  },
);
Switch.displayName = 'Switch';

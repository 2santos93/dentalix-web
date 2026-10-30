import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Shared anatomy of the choice controls (Checkbox, RadioOption, Switch): a
 * real `<input>` restyled with `appearance-none`, the mark drawn by a sibling
 * that reacts to the input with `peer-*`, and an optional label row whose
 * padding makes the whole row a 44px target on touch.
 */

/** The box/circle shared by Checkbox and RadioOption. 16px, 20px on touch. */
export const choiceBoxClass =
  'peer m-0 size-4 shrink-0 cursor-pointer appearance-none border border-border-input bg-surface transition-colors not-checked:hover:border-muted checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:checked:border-muted disabled:checked:bg-muted aria-invalid:border-danger pointer-coarse:size-5';

/** Wraps the input and its drawn mark so the mark can sit on top of it. */
export function ChoiceControl({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('relative inline-flex shrink-0', className)}>{children}</span>;
}

/** The drawn mark, centered over the input; `className` decides when it shows. */
export const choiceMarkClass = 'pointer-events-none absolute inset-0 m-auto';

interface ChoiceRowProps {
  control: React.ReactNode;
  label: React.ReactNode;
  labelId: string;
  description?: React.ReactNode;
  descriptionId: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Label row: the whole row is the `<label>` (so it toggles the control) and
 * pads to 44px on touch. The accessible name is only `label` (the control
 * points at it with `aria-labelledby`); `description` is its description.
 */
export function ChoiceRow({
  control,
  label,
  labelId,
  description,
  descriptionId,
  disabled,
  className,
}: ChoiceRowProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 py-1.5 pointer-coarse:py-3',
        disabled && 'cursor-not-allowed opacity-70',
        className,
      )}
    >
      <span className="flex h-5 items-center pointer-coarse:h-6">{control}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-sm text-ink">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

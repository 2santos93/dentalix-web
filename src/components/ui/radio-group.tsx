'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { describedBy } from '@/lib/ui/compose-refs';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { ChoiceControl, ChoiceRow, choiceBoxClass, choiceMarkClass } from './choice';

interface RadioGroupContextValue {
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  invalid: boolean;
  /** ids every option points at (group hint/error), so each one announces them. */
  describedBy?: string;
  disabled?: boolean;
  required?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

function useRadioGroup(component: string): RadioGroupContextValue {
  const context = React.useContext(RadioGroupContext);
  if (!context) throw new Error(`<${component}> va dentro de <RadioGroup>.`);
  return context;
}

export interface RadioGroupProps {
  /**
   * The group's id. The FIRST option should take it too (`<RadioOption id={id}>`),
   * so a form that focuses `id` on error lands on the group; the error carries
   * `fieldErrorId(id)`, the same contract as `FormField`.
   */
  id: string;
  /** Visible question, rendered as the fieldset's `<legend>`. */
  legend: React.ReactNode;
  /** Native radio `name`; defaults to `id`. */
  name?: string;
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  hint?: React.ReactNode;
  /** Validation message (rung 4, `InlineError`) under the options. */
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  /** Classes for the fieldset. */
  className?: string;
  /** Classes for the options container (e.g. `grid grid-cols-2 gap-2` for cards). */
  optionsClassName?: string;
  children: React.ReactNode;
}

/**
 * One question, several exclusive answers: a `<fieldset role="radiogroup">`
 * with a `<legend>` and native radios (`RadioOption` for lists, `RadioCard`
 * for options that need a description). The group's hint and error are wired
 * into every option's `aria-describedby`, since not every screen reader
 * announces the group's when focus enters it.
 */
export function RadioGroup({
  id,
  legend,
  name,
  value,
  defaultValue,
  onValueChange,
  hint,
  error,
  disabled,
  required,
  className,
  optionsClassName,
  children,
}: RadioGroupProps) {
  const hintId = `${id}-hint`;
  const errorId = fieldErrorId(id);
  const groupDescribedBy = describedBy(hint && !error ? hintId : null, error ? errorId : null);
  const context: RadioGroupContextValue = {
    name: name ?? id,
    value,
    defaultValue,
    onValueChange,
    invalid: Boolean(error),
    describedBy: groupDescribedBy,
    disabled,
    required,
  };

  return (
    <fieldset
      role="radiogroup"
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={groupDescribedBy}
      disabled={disabled}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
    >
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <RadioGroupContext.Provider value={context}>
        <div className={cn('flex flex-col', optionsClassName)}>{children}</div>
      </RadioGroupContext.Provider>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <InlineError id={errorId} className="text-xs">
          {error}
        </InlineError>
      ) : null}
    </fieldset>
  );
}

type RadioInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'name' | 'value' | 'checked' | 'defaultChecked'
>;

/** Props + state of one radio inside a group, shared by both variants. */
function useRadio(component: string, value: string, id: string | undefined, props: RadioInputProps) {
  const group = useRadioGroup(component);
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const { onChange, disabled, ...rest } = props;
  const checkedProps =
    group.value !== undefined
      ? { checked: group.value === value }
      : group.defaultValue !== undefined
        ? { defaultChecked: group.defaultValue === value }
        : {};
  return {
    group,
    inputId,
    disabled: disabled ?? group.disabled,
    inputProps: {
      ...rest,
      ...checkedProps,
      id: inputId,
      type: 'radio' as const,
      name: group.name,
      value,
      required: group.required,
      'aria-invalid': group.invalid || undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(event);
        if (event.target.checked) group.onValueChange?.(value);
      },
    },
  };
}

function RadioCircle({
  inputRef,
  inputProps,
  describedById,
  labelledById,
  disabled,
}: {
  inputRef: React.Ref<HTMLInputElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  describedById?: string;
  labelledById: string;
  disabled?: boolean;
}) {
  return (
    <ChoiceControl>
      <input
        ref={inputRef}
        aria-labelledby={labelledById}
        {...inputProps}
        disabled={disabled}
        aria-describedby={describedById}
        className={cn(choiceBoxClass, 'rounded-full')}
      />
      <span
        aria-hidden
        className={cn(choiceMarkClass, 'hidden size-1.5 rounded-full bg-primary-fg peer-checked:block pointer-coarse:size-2')}
      />
    </ChoiceControl>
  );
}

export interface RadioOptionProps extends RadioInputProps {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** A radio in a list: circle + label (+ description), 44px row on touch. */
export const RadioOption = React.forwardRef<HTMLInputElement, RadioOptionProps>(
  ({ value, label, description, id, className, ...props }, ref) => {
    const { group, inputId, disabled, inputProps } = useRadio('RadioOption', value, id, props);
    const labelId = `${inputId}-label`;
    const descriptionId = `${inputId}-description`;
    return (
      <ChoiceRow
        control={
          <RadioCircle
            inputRef={ref}
            inputProps={inputProps}
            labelledById={labelId}
            describedById={describedBy(
              props['aria-describedby'],
              description ? descriptionId : null,
              group.describedBy,
            )}
            disabled={disabled}
          />
        }
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
RadioOption.displayName = 'RadioOption';

export interface RadioCardProps extends Omit<RadioInputProps, 'title'> {
  value: string;
  title: React.ReactNode;
  /** Short line under or beside the title (an example, a consequence). */
  description?: React.ReactNode;
  /** `inline` puts the description beside the title (the 12 h / 24 h cards). */
  layout?: 'stacked' | 'inline';
}

/**
 * A radio as a bordered card (the register page's 12 h / 24 h choice): the
 * whole card is the label; selected = accent border + accent-subtle fill;
 * an invalid group outlines its unselected cards in danger.
 */
export const RadioCard = React.forwardRef<HTMLInputElement, RadioCardProps>(
  ({ value, title, description, layout = 'stacked', id, className, ...props }, ref) => {
    const { group, inputId, disabled, inputProps } = useRadio('RadioCard', value, id, props);
    const titleId = `${inputId}-label`;
    const descriptionId = `${inputId}-description`;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg border bg-surface px-3 py-2.5 transition-colors [&:not(:has(:checked)):hover]:bg-surface-sunken pointer-coarse:min-h-11',
          'has-checked:border-primary-border has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-text',
          group.invalid ? 'border-danger' : 'border-border',
          disabled && 'cursor-not-allowed opacity-70 [&:not(:has(:checked)):hover]:bg-surface',
          className,
        )}
      >
        <span className="flex h-5 items-center pointer-coarse:h-6">
          <RadioCircle
            inputRef={ref}
            inputProps={inputProps}
            labelledById={titleId}
            describedById={describedBy(
              props['aria-describedby'],
              description ? descriptionId : null,
              group.describedBy,
            )}
            disabled={disabled}
          />
        </span>
        <span
          className={cn(
            'flex min-w-0',
            layout === 'inline' ? 'flex-wrap items-baseline gap-x-2' : 'flex-col gap-0.5',
          )}
        >
          <span id={titleId} className="text-sm font-medium text-ink">
            {title}
          </span>
          {description ? (
            <span id={descriptionId} className="text-xs text-muted">
              {description}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);
RadioCard.displayName = 'RadioCard';

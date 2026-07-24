import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  /** id of the control this field labels (ties <Label htmlFor> to the input). */
  htmlFor: string;
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** Molecule: label + control + hint/error, the standard row for any form. */
export function FormField({
  htmlFor,
  label,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

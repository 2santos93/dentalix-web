'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Controlado por fuera cuando un botón muestra dos campos a la vez (restablecer). */
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  showLabel: string;
  hideLabel: string;
}

/**
 * Campo de contraseña con el botón de mostrar/ocultar dentro, a la derecha.
 * El botón ocupa todo el alto del campo y 44 px de ancho (objetivo táctil).
 */
export function PasswordInput({
  visible,
  onVisibleChange,
  showLabel,
  hideLabel,
  disabled,
  className,
  ...props
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-11', className)}
      />
      <button
        type="button"
        onClick={() => onVisibleChange(!visible)}
        disabled={disabled}
        aria-pressed={visible}
        aria-label={visible ? hideLabel : showLabel}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

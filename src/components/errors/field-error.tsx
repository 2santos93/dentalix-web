import * as React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export const fieldErrorCopy = {
  retry: 'Reintentar',
};

interface FieldErrorProps {
  /** Etiqueta corta (≤4 palabras). El contexto lo da el `<label>` del campo. */
  label: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Para igualar la altura del control que sustituye (`h-9`, `h-10`…). */
  className?: string;
}

/**
 * Escalón 2 de la escalera de errores: falló UN control, no la pantalla.
 *
 * Sustituye al control en su sitio en lugar de añadir un mensaje debajo. Eso
 * resuelve tres cosas a la vez: no empuja el layout, no deja el control roto
 * con cara de normal, y pone el fallo y su solución en los mismos píxeles que
 * el usuario ya estaba mirando.
 *
 * `role="status"` y no `alert`: un filtro caído no justifica interrumpir a un
 * lector de pantalla a mitad de frase.
 */
export function FieldError({
  label,
  onRetry,
  retryLabel = fieldErrorCopy.retry,
  className,
}: FieldErrorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3',
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-danger" />
      <span className="flex-1 truncate text-sm text-ink">{label}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          aria-label={retryLabel}
          title={retryLabel}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

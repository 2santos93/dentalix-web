import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Escalón 4 de la escalera de errores: validación o fallo de envío de un
 * formulario. No es un fallo de carga — el usuario acaba de actuar y necesita
 * la respuesta junto al control que la provocó, en el mismo momento.
 *
 * El icono no es decoración: sin él el mensaje comunicaría únicamente por
 * color (WCAG 1.4.1).
 */
export function InlineError({
  children,
  id,
  variant = 'inline',
  className,
}: {
  children: React.ReactNode;
  /** Para `aria-describedby` desde los campos del formulario. */
  id?: string;
  /**
   * `inline` — mensaje junto a un campo.
   * `summary` — resumen a nivel de formulario o modal: misma familia, más peso
   *   visual, porque resume el fallo de un envío y no la validación de un campo.
   */
  variant?: 'inline' | 'summary';
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-1.5 text-sm text-danger',
        variant === 'summary' &&
          'rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-medium',
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

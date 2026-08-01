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
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn('flex items-start gap-1.5 text-sm text-danger', className)}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

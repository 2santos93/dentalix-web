import * as React from 'react';
import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const sectionErrorCopy = {
  title: 'No se pudo cargar',
  retry: 'Reintentar',
};

interface SectionErrorProps {
  /** Titular corto. Por defecto, "No se pudo cargar". */
  title?: string;
  /** Qué falló, en una línea. Sin "Intenta de nuevo." si hay botón. */
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Escalón 1 de la escalera de errores: la sección no tiene nada que mostrar.
 * Ocupa el sitio donde iría el contenido, con la misma geometría que
 * `EmptyState` (mismo radio, mismo padding, mismo ritmo vertical) para que
 * "vacío" y "roto" se lean como dos caras del mismo sistema; el borde sólido
 * en lugar de discontinuo es lo que los distingue.
 *
 * El rojo se limita al chip del icono: un bloque rojo entero exagera la
 * severidad de un fetch fallido y contradice el uso de `danger` que fija
 * DESIGN.md. El botón es primario, no destructivo — reintentar no destruye nada.
 */
export function SectionError({
  title = sectionErrorCopy.title,
  description,
  onRetry,
  retryLabel = sectionErrorCopy.retry,
  className,
}: SectionErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-1 flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger"
      >
        <CloudOff className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {onRetry ? (
        <Button type="button" onClick={onRetry} className="mt-3">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

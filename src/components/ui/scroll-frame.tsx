'use client';
import * as React from 'react';
import { useHorizontalOverflow } from '@/lib/ui/use-horizontal-overflow';
import { cn } from '@/lib/utils';

interface ScrollFrameProps {
  /** Nombre de la región cuando el contenido no cabe (p. ej. el título de la tabla). */
  label: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Marco que se desplaza de lado cuando lo de dentro (una tabla con
 * `min-w-*`) es más ancho que él, para una tabla que debe seguir siendo tabla
 * en móvil en vez de apilarse como `Table` (DESIGN.md, «Tables · Wider than
 * its slot»). Solo si no cabe es una región con nombre, parada de tabulador
 * (con las flechas se llega a las últimas columnas sin ratón) y sombras en los
 * bordes con contenido por ver; si cabe, es un `div` sin más.
 *
 * `min-w-0`: dentro de un contenedor grid o flex (el diálogo es grid), un
 * hijo con `min-width: auto` crece hasta el ancho mínimo de la tabla y
 * desborda al contenedor en vez de desplazarse dentro de su marco.
 */
export function ScrollFrame({ label, className, children }: ScrollFrameProps) {
  const [frame, overflows] = useHorizontalOverflow<HTMLDivElement>();
  return (
    <div
      ref={frame}
      className={cn(
        'min-w-0 max-w-full overflow-x-auto',
        overflows && 'scroll-x-shadows',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...(overflows ? { role: 'region', tabIndex: 0, 'aria-label': label } : {})}
    >
      {children}
    </div>
  );
}

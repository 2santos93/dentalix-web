import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acciones a la derecha (en móvil, debajo del título). */
  actions?: React.ReactNode;
  /** Nivel del título: `h2` dentro de una página, `h3` dentro de una pestaña o tarjeta. */
  as?: 'h2' | 'h3' | 'h4';
  titleId?: string;
}

/**
 * Cabecera de una sección dentro de la página (DESIGN.md → Section header):
 * `t-title` + línea de apoyo opcional + acciones. La cabecera de la página es
 * `PageHeader`; esta es la del bloque.
 */
export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  titleId,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Heading id={titleId} className="t-title text-ink">
          {title}
        </Heading>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

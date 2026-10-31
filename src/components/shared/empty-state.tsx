import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Clases del contenedor de `action`, p. ej. `w-full sm:w-auto` para botones a todo el ancho en móvil. */
  actionClassName?: string;
  /** Exposes the block as a status region for loading/empty announcements. */
  role?: 'status';
  /**
   * `block` (por defecto): el vacío de una pestaña o una página entera, caja
   * discontinua centrada. `inline`: el vacío de UNA sección dentro de una
   * página con más secciones (los bloques de la ficha): una línea alineada a
   * la izquierda, sin caja — la acción vive en la cabecera de la sección. Una
   * caja de 200px por cada «no hay nada» convertía la pestaña Datos en una
   * columna de huecos (critique-core §7).
   */
  size?: 'block' | 'inline';
}

/** Molecule: placeholder for empty lists / zero-result states. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  actionClassName,
  role,
  size = 'block',
}: EmptyStateProps) {
  if (size === 'inline') {
    return (
      <div role={role} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? <div className="mt-0.5 shrink-0 text-faint [&_svg]:size-4">{icon}</div> : null}
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="font-medium text-ink">{title}</p>
            {description ? <p className="max-w-[68ch] text-muted">{description}</p> : null}
          </div>
        </div>
        {action ? <div className={cn('shrink-0', actionClassName)}>{action}</div> : null}
      </div>
    );
  }
  return (
    <div
      role={role}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center"
    >
      {icon ? <div className="mb-1 text-muted [&_svg]:size-8">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className={cn('mt-3', actionClassName)}>{action}</div> : null}
    </div>
  );
}

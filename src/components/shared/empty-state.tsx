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
}

/** Molecule: centered placeholder for empty lists / zero-result states. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  actionClassName,
  role,
}: EmptyStateProps) {
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

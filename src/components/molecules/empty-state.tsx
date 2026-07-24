import * as React from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Exposes the block as a status region for loading/empty announcements. */
  role?: 'status';
}

/** Molecule: centered placeholder for empty lists / zero-result states. */
export function EmptyState({
  title,
  description,
  icon,
  action,
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
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

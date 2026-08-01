'use client';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from './empty-state';

interface AsyncSectionProps {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  /** When true (and not loading/error), render the empty state instead of children. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** Skeleton shown while loading. Defaults to a few shimmer rows. */
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The one place async UI branches: loading → skeleton (never a bare "Cargando…"
 * string), error → message + retry, empty → a teaching empty state, else the
 * content. Replaces the hand-rolled `{loading && <p>}` / `{error && <p> + retry}`
 * triads scattered across the views so every screen loads the same way.
 */
export function AsyncSection({
  loading,
  error,
  onRetry,
  retryLabel,
  isEmpty = false,
  emptyTitle = 'Sin datos por ahora',
  emptyDescription,
  emptyIcon,
  emptyAction,
  skeleton,
  children,
}: AsyncSectionProps) {
  if (loading) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (error) {
    return <SectionError description={error} onRetry={onRetry} retryLabel={retryLabel} />;
  }
  if (isEmpty) {
    return (
      <EmptyState
        role="status"
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        action={emptyAction}
      />
    );
  }
  return <>{children}</>;
}

/** A neutral three-row shimmer for content whose shape isn't known here. */
function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Table-shaped skeleton: a header bar + N rows, for list/table sections. */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border" role="status" aria-label="Cargando">
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-hairline">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-28 sm:block" />
            <Skeleton className="hidden h-4 w-40 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

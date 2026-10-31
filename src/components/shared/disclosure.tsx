'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisclosureProps {
  /** The trigger's label — what is behind the fold. */
  summary: string;
  /**
   * The part that must stay readable while collapsed: a count, a total, a
   * due date. Whatever a user needs to decide whether to open it.
   */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Optional `id` on the trigger, so a heading or a test can point at it. */
  triggerId?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A labelled fold: one row that names what is inside plus the figure that
 * decides whether to open it, and a region that only mounts its children while
 * it is open.
 *
 * The region element itself is always in the DOM (`hidden` when closed) so the
 * trigger's `aria-controls` always resolves — the same split
 * `patients/[id]/page.tsx`'s `TabPanel` makes, and for the same reason.
 *
 * Not a `<details>`: the summary row carries a live `meta` node that changes
 * as data refreshes, and `<summary>`'s content model plus its built-in
 * disclosure triangle fight both the layout and the tokens.
 */
export function Disclosure({
  summary,
  meta,
  defaultOpen = false,
  triggerId,
  className,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
          <span className="truncate text-sm font-medium text-ink">{summary}</span>
        </span>
        {meta ? <span className="shrink-0 text-sm text-muted tabular-nums">{meta}</span> : null}
      </button>
      <div id={regionId} hidden={!open} className={open ? 'px-2 pb-2 pt-1' : undefined}>
        {open ? children : null}
      </div>
    </div>
  );
}

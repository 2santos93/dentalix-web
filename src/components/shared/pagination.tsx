'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Copy as constants (i18n-ready, es-first) — matches the rest of the app's
// copy convention (page-header.tsx / empty-state.tsx) until next-intl lands.
const copy = {
  navLabel: 'Paginación',
  prev: 'Anterior',
  next: 'Siguiente',
  /** e.g. "1–20 de 137" — the visible slice of the total. */
  range: (from: number, to: number, total: number) => `${from}–${to} de ${total}`,
  pageOf: (page: number, totalPages: number) => `Página ${page} de ${totalPages}`,
};

interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Items per page — the server's effective page size (read it off the response, don't assume). */
  pageSize: number;
  /** Total items across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Disables both controls (e.g. while a page is in flight). */
  disabled?: boolean;
}

/**
 * Page-at-a-time navigation for server-paginated lists: a range summary
 * ("1–20 de 137") plus Anterior/Siguiente. Renders NOTHING when everything
 * fits on one page, so small clinics never see dead controls.
 *
 * Deliberately prev/next rather than numbered page links: the API exposes
 * `page`/`pageSize`/`total` (see `listPatients`) and clinical lists are
 * scanned sequentially, not jumped around — numbered pages would add chrome
 * without adding reach. Counts use tabular numerals so the summary doesn't
 * jitter between pages (DESIGN.md "The Tabular Rule").
 */
export function Pagination({ page, pageSize, total, onPageChange, disabled }: PaginationProps) {
  // Guard the pre-first-response state (`pageSize` still 0): `total / 0` is
  // NaN/Infinity, and `NaN <= 1` is false — without this the component would
  // slip past the one-page check below and render "Página 1 de NaN".
  if (pageSize <= 0 || total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Everything fits on one page — no controls at all.
  if (totalPages <= 1) return null;

  // Clamp to the real slice: on the last page `to` is `total`, not page*pageSize.
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      aria-label={copy.navLabel}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
    >
      <p className="text-sm text-muted tabular-nums">
        {copy.range(from, to, total)}
        <span className="sr-only"> · {copy.pageOf(page, totalPages)}</span>
      </p>
      <div className="flex items-center gap-2">
        <span aria-hidden className="hidden text-xs text-muted tabular-nums sm:inline">
          {copy.pageOf(page, totalPages)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isFirst}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft /> {copy.prev}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isLast}
          onClick={() => onPageChange(page + 1)}
        >
          {copy.next} <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

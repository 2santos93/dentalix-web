'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const copy = {
  pagination: 'Paginación',
  prev: 'Anterior',
  next: 'Siguiente',
  page: (n: number) => `Página ${n}`,
};

interface CursorPaginationProps {
  /** Página que se ve, desde 1 (la altura de la pila de cursores). */
  page: number;
  hasNext: boolean;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Anterior/Siguiente para los registros que la API pagina por CURSOR (sin
 * total, así que no hay «1–50 de N» como en `Pagination`). Botones de tamaño
 * normal: 44 px en pantallas táctiles.
 */
export function CursorPagination({ page, hasNext, disabled = false, onPrev, onNext }: CursorPaginationProps) {
  return (
    <nav
      aria-label={copy.pagination}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4"
    >
      <p className="t-data text-sm text-muted" aria-live="polite">
        {copy.page(page)}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || page <= 1} onClick={onPrev}>
          <ChevronLeft aria-hidden /> {copy.prev}
        </Button>
        <Button type="button" variant="outline" disabled={disabled || !hasNext} onClick={onNext}>
          {copy.next} <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

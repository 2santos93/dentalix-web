import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Una cifra de un resumen de reporte: etiqueta (`t-overline`), valor
 * (`t-data`, tabular) y, si hace falta, una línea de contexto. Va dentro de
 * un `StatGroup` (es un par `<dt>`/`<dd>` de su `<dl>`).
 */
export function Stat({
  label,
  value,
  hint,
  testId,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={cn('flex min-w-0 flex-col gap-1 bg-surface p-4', className)}>
      <dt className="t-overline">{label}</dt>
      <dd className="t-data min-w-0 break-words text-xl font-semibold text-ink">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/**
 * Un bloque de cifras con título: una rejilla de `Stat` separadas por una
 * línea fina (`gap-px` sobre `border-subtle`), sin tarjetas anidadas. Las
 * columnas las pone quien lo usa (`className`, p. ej. `grid-cols-2 sm:grid-cols-3`).
 * Lo comparten «Huecos recuperados» (DX-436) y «Presupuestos» (DX-558).
 */
export function StatGroup({
  title,
  children,
  className,
  as: Heading = 'h3',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Nivel del título: `h2` cuando el bloque cuelga directamente del `h1` de la página (DX-172). */
  as?: 'h2' | 'h3';
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title}>
      <Heading className="t-label text-ink">{title}</Heading>
      <dl
        className={cn(
          'grid min-w-0 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle',
          className,
        )}
      >
        {children}
      </dl>
    </section>
  );
}

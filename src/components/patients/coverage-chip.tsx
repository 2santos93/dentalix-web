import { ShieldAlert } from 'lucide-react';
import type { CoverageSummary } from '@/lib/patients/patients-api';
import { COVERAGE_EXPIRED_LABEL, coverageChipText } from '@/lib/patients/coverage-presentation';
import { cn } from '@/lib/utils';

export { COVERAGE_EXPIRED_LABEL };

/**
 * Marca compacta (solo icono) para la fila de la hora de las tarjetas cortas de
 * la agenda, donde el chip textual se recorta (DX-153, mismo recurso que DX-210).
 * El nombre accesible lo da el `aria-label` de la tarjeta o, en la semana, el
 * `sr-only` de `srText`.
 */
export function CoverageMarker({
  coverage,
  srText = false,
  className,
}: {
  coverage: CoverageSummary | null | undefined;
  /** Añade el texto solo para lectores (cuando la tarjeta no lleva `aria-label`). */
  srText?: boolean;
  className?: string;
}) {
  const text = coverageChipText(coverage);
  if (!text) return null;
  return (
    <span data-testid="coverage-marker" title={text} className={cn('inline-flex shrink-0', className)}>
      <ShieldAlert aria-hidden className="size-3.5 text-warning-text" />
      {srText ? <span className="sr-only">{text}</span> : null}
    </span>
  );
}

/**
 * Chip «Cobertura vencida» (DX-153) de la cabecera de la ficha, hermano de
 * `OverdueChip`. Solo informa: sin cobertura, vigente o pendiente de inicio no
 * pinta nada. No lleva el número de afiliado ni ningún dato personal.
 */
export function CoverageChip({
  coverage,
  className,
  compact = false,
}: {
  coverage: CoverageSummary | null | undefined;
  className?: string;
  /** Una línea, sin icono. */
  compact?: boolean;
}) {
  const text = coverageChipText(coverage);
  if (!text) return null;
  return (
    <span
      data-testid="coverage-chip"
      title={text}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-warning-text tabular-nums',
        compact ? 'border border-warning/40 bg-surface' : 'bg-warning-subtle',
        className,
      )}
    >
      {compact ? null : <ShieldAlert aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

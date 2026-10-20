import { ShieldAlert } from 'lucide-react';
import type { CoverageSummary } from '@/lib/patients/patients-api';
import { COVERAGE_EXPIRED_LABEL, coverageChipText } from '@/lib/patients/coverage-presentation';
import { cn } from '@/lib/utils';

export { COVERAGE_EXPIRED_LABEL };

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
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-warning tabular-nums',
        compact ? 'border border-warning/40 bg-surface' : 'bg-warning/15',
        className,
      )}
    >
      {compact ? null : <ShieldAlert aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

import type { CoverageSummary } from '@/lib/patients/patients-api';
import { coverageDetailText } from '@/lib/patients/coverage-presentation';

/** Línea «Cobertura: …» del detalle de la cita (DX-153); el texto vive en `coverage-presentation`. */

export function CoverageDetailLine({
  coverage,
}: {
  coverage: CoverageSummary | null | undefined;
}) {
  const text = coverageDetailText(coverage);
  if (!text) return null;
  return (
    <p
      data-testid="coverage-detail-line"
      className={
        coverage?.status === 'EXPIRED' ? 'text-sm text-warning' : 'text-sm text-muted'
      }
    >
      {text}
    </p>
  );
}

import type { CoverageSummary } from '@/lib/patients/patients-api';
import type { CivilDayPainter } from '@/lib/patients/agreement-presentation';
import { coverageDetailText } from '@/lib/patients/coverage-presentation';

/** Línea «Cobertura: …» del detalle de la cita (DX-153); el texto vive en `coverage-presentation`. */

export function CoverageDetailLine({
  coverage,
  stamp,
}: {
  coverage: CoverageSummary | null | undefined;
  /** El día de vencimiento con el formato de la sede de la cita (DX-354b). */
  stamp: CivilDayPainter;
}) {
  const text = coverageDetailText(coverage, stamp);
  if (!text) return null;
  return (
    <p
      data-testid="coverage-detail-line"
      className={
        coverage?.status === 'EXPIRED' ? 'text-sm text-warning-text' : 'text-sm text-muted'
      }
    >
      {text}
    </p>
  );
}

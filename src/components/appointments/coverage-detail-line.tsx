import { formatCivilDate } from '@/lib/format/date';
import type { CoverageSummary } from '@/lib/patients/patients-api';

/**
 * Línea «Cobertura: …» del detalle de la cita (DX-153). Vacía (null) cuando el
 * paciente no tiene cobertura. Nunca lleva el número de afiliado.
 */
export function coverageDetailText(coverage: CoverageSummary | null | undefined): string {
  if (!coverage || coverage.status === 'NONE' || !coverage.payerName) return '';
  const detail =
    coverage.status === 'EXPIRED'
      ? `venció el ${formatCivilDate(coverage.validTo)}`
      : coverage.planName;
  return ['Cobertura: ' + coverage.payerName, detail].filter(Boolean).join(' · ');
}

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

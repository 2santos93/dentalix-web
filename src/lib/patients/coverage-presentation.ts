import { formatCivilDate } from '@/lib/format/date';
import type { PatientCoverage } from '@/lib/patients/coverages-api';
import type { CoverageSummary } from '@/lib/patients/patients-api';

// DX-153: textos derivados de la cobertura. Puros, para que la sección, la
// cabecera y los tests compartan el mismo vocabulario.

/** Texto de la marca de la cabecera cuando la cobertura venció. */
export const COVERAGE_EXPIRED_LABEL = 'Cobertura vencida';

/**
 * Texto de la marca «Cobertura vencida» de la cabecera. Vacío (nada que
 * pintar) salvo que el resumen diga `EXPIRED`: sin cobertura, vigente o
 * pendiente de inicio no hay aviso que dar.
 */
export function coverageChipText(summary: CoverageSummary | null | undefined): string {
  return summary?.status === 'EXPIRED' ? COVERAGE_EXPIRED_LABEL : '';
}

type CoverageValidity = Pick<PatientCoverage, 'status' | 'validFrom' | 'validTo'>;

/** Vigencia en una línea: «Vigente hasta …», «Desde …», «Sin fecha de fin», «Venció el …». */
export function coverageValidityLabel(c: CoverageValidity): string {
  if (c.status === 'EXPIRED') return `Venció el ${formatCivilDate(c.validTo)}`;
  if (c.status === 'NOT_STARTED') return `Desde ${formatCivilDate(c.validFrom)}`;
  return c.validTo ? `Vigente hasta ${formatCivilDate(c.validTo)}` : 'Sin fecha de fin';
}

export interface CoverageBadge {
  label: string;
  variant: 'warning' | 'secondary';
}

/** Insignia de estado de la fila; `null` para una cobertura vigente (no hay nada que marcar). */
export function coverageStatusBadge(c: Pick<PatientCoverage, 'status'>): CoverageBadge | null {
  if (c.status === 'EXPIRED') return { label: 'Vencida', variant: 'warning' };
  if (c.status === 'NOT_STARTED') return { label: 'Pendiente de inicio', variant: 'secondary' };
  return null;
}

/**
 * Línea «Cobertura: …» del detalle de la cita. Vacía cuando el paciente no tiene
 * cobertura. Nunca lleva el número de afiliado.
 */
export function coverageDetailText(coverage: CoverageSummary | null | undefined): string {
  if (!coverage || coverage.status === 'NONE' || !coverage.payerName) return '';
  const detail =
    coverage.status === 'EXPIRED'
      ? `venció el ${formatCivilDate(coverage.validTo)}`
      : coverage.status === 'NOT_STARTED'
        ? 'pendiente de inicio'
        : coverage.planName;
  return ['Cobertura: ' + coverage.payerName, detail].filter(Boolean).join(' · ');
}

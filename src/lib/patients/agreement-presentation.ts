import { formatCivilDate } from '@/lib/format/date';
import type { PatientAgreement } from '@/lib/patients/patient-agreement-api';
import type { AgreementSummary } from '@/lib/patients/patients-api';

// DX-105: textos derivados del convenio del paciente. Puros, para que la
// sección, la cabecera y los tests compartan el mismo vocabulario.

type AgreementValidity = Pick<PatientAgreement, 'status' | 'validFrom' | 'validTo'>;

/** Vigencia en una línea: «Vigente hasta …», «Desde …», «Sin fecha de fin», «Venció el …». */
export function agreementValidityLabel(a: AgreementValidity): string {
  if (a.status === 'EXPIRED') return `Venció el ${formatCivilDate(a.validTo)}`;
  if (a.status === 'NOT_STARTED') return `Desde ${formatCivilDate(a.validFrom)}`;
  return a.validTo ? `Vigente hasta ${formatCivilDate(a.validTo)}` : 'Sin fecha de fin';
}

export interface AgreementBadge {
  label: string;
  variant: 'success' | 'warning' | 'secondary' | 'muted';
}

/** Insignia de estado del convenio asignado. */
export function agreementStatusBadge(a: Pick<PatientAgreement, 'status'>): AgreementBadge {
  switch (a.status) {
    case 'EXPIRED':
      return { label: 'Vencido', variant: 'warning' };
    case 'NOT_STARTED':
      return { label: 'Pendiente de inicio', variant: 'secondary' };
    case 'INACTIVE':
      return { label: 'Convenio inactivo', variant: 'muted' };
    default:
      return { label: 'Vigente', variant: 'success' };
  }
}

/** Texto del chip de la cabecera: «Convenio: X» solo con un convenio vigente; vacío si no. */
export function agreementChipText(summary: AgreementSummary | null | undefined): string {
  if (summary?.status !== 'ACTIVE' || !summary.agreementName) return '';
  return `Convenio: ${summary.agreementName}`;
}

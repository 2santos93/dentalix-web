import { statusPresentation, type StatusTone } from '@/lib/status/tones';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import type { PatientAgreement } from '@/lib/patients/patient-agreement-api';
import type { AgreementSummary } from '@/lib/patients/patients-api';

// DX-105: textos derivados del convenio del paciente. Puros, para que la
// sección, la cabecera y los tests compartan el mismo vocabulario.

type AgreementValidity = Pick<PatientAgreement, 'status' | 'validFrom' | 'validTo'>;

/** El pintor de un día civil de la sede (`SedePainters.civilDate`): el formato lo da la sede, no esta función (DX-354b). */
export type CivilDayPainter = Pick<SedePainters, 'civilDate'>;

/** Vigencia en una línea: «Vigente hasta …», «Desde …», «Sin fecha de fin», «Venció el …». */
export function agreementValidityLabel(a: AgreementValidity, stamp: CivilDayPainter): string {
  if (a.status === 'EXPIRED') return `Venció el ${stamp.civilDate(a.validTo)}`;
  if (a.status === 'NOT_STARTED') return `Desde ${stamp.civilDate(a.validFrom)}`;
  return a.validTo ? `Vigente hasta ${stamp.civilDate(a.validTo)}` : 'Sin fecha de fin';
}

export interface AgreementBadge {
  label: string;
  variant: StatusTone;
}

/** Insignia de estado del convenio asignado: tono y etiqueta del mapa único (`@/lib/status/tones`). */
export function agreementStatusBadge(a: Pick<PatientAgreement, 'status'>): AgreementBadge {
  const { tone, label } = statusPresentation('agreement', a.status);
  return { label, variant: tone };
}

/** Texto del chip de la cabecera: «Convenio: X» solo con un convenio vigente; vacío si no. */
export function agreementChipText(summary: AgreementSummary | null | undefined): string {
  if (summary?.status !== 'ACTIVE' || !summary.agreementName) return '';
  return `Convenio: ${summary.agreementName}`;
}

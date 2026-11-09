import { statusPresentation, type StatusTone } from '@/lib/status/tones';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import type { PatientAgreement } from '@/lib/patients/patient-agreement-api';
import type { AgreementSummary } from '@/lib/patients/patients-api';

// DX-105: textos derivados del convenio del paciente. Puros, para que la
// sección, la cabecera y los tests compartan el mismo vocabulario.

type AgreementDates = { validFrom: string | null; validTo: string | null };

/**
 * La asignación y, si se conoce, el convenio en sí (DX-105-bis): el estado lo
 * calcula la API con las DOS vigencias, así que la fecha que se explica tiene
 * que salir de las dos (antes «Venció el —» cuando venció el convenio y no la
 * asignación).
 */
type AgreementValidity = Pick<PatientAgreement, 'status'> &
  AgreementDates & { agreement?: AgreementDates | null };

/** El pintor de un día civil de la sede (`SedePainters.civilDate`): el formato lo da la sede, no esta función (DX-354b). */
export type CivilDayPainter = Pick<SedePainters, 'civilDate'>;

/**
 * La vigencia efectiva de una asignación: empieza en la ÚLTIMA fecha de inicio
 * (asignación o convenio) y acaba en la PRIMERA de fin. Días civiles ISO
 * (`YYYY-MM-DD`): se comparan como texto.
 */
export function effectiveValidity(a: AgreementDates & { agreement?: AgreementDates | null }): AgreementDates {
  const starts = [a.validFrom, a.agreement?.validFrom ?? null].filter((d): d is string => d !== null);
  const ends = [a.validTo, a.agreement?.validTo ?? null].filter((d): d is string => d !== null);
  return {
    validFrom: starts.length > 0 ? starts.reduce((latest, d) => (d > latest ? d : latest)) : null,
    validTo: ends.length > 0 ? ends.reduce((earliest, d) => (d < earliest ? d : earliest)) : null,
  };
}

/** Vigencia en una línea: «Vigente hasta …», «Desde …», «Sin fecha de fin», «Venció el …». */
export function agreementValidityLabel(a: AgreementValidity, stamp: CivilDayPainter): string {
  const { validFrom, validTo } = effectiveValidity(a);
  // Sin fecha que explicar (p. ej. el convenio se desactivó): el estado, sin inventar un día.
  if (a.status === 'EXPIRED') return validTo ? `Venció el ${stamp.civilDate(validTo)}` : 'Vencido';
  if (a.status === 'NOT_STARTED') return validFrom ? `Desde ${stamp.civilDate(validFrom)}` : 'Todavía no vigente';
  return validTo ? `Vigente hasta ${stamp.civilDate(validTo)}` : 'Sin fecha de fin';
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

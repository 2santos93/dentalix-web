import { addMonths } from '@/lib/appointments/calendar-grid';
import {
  RADIOLOGY_KIND_LABELS,
  type RadiologyLicenseCategory,
  type RadiologyRecord,
  type RadiologyRecordKind,
} from './radiology-api';

/** Vigencias por defecto en meses (las mismas que aplica la API, DX-544). */
export const RADIOLOGY_VALIDITY_MONTHS = {
  LICENSE_I: 60,
  LICENSE_II: 48,
  QUALITY_CONTROL: 24,
} as const;

/** El aviso de «Mi día» empieza 90 días antes del vencimiento (como la API). */
export const RADIOLOGY_DUE_SOON_DAYS = 90;

/**
 * El vencimiento que la API calculará si no se escribe uno: la expedición +
 * 5 años (licencia I), 4 (licencia II) o 2 (control de calidad), recortando a
 * fin de mes. Solo lo PROPONE en el formulario: la API es la que lo fija.
 */
export function proposedExpiresOn(
  kind: RadiologyRecordKind,
  category: RadiologyLicenseCategory | null,
  issuedOn: string | null,
): string | null {
  if (!issuedOn) return null;
  if (kind === 'QUALITY_CONTROL') return addMonths(issuedOn, RADIOLOGY_VALIDITY_MONTHS.QUALITY_CONTROL);
  if (!category) return null;
  return addMonths(issuedOn, RADIOLOGY_VALIDITY_MONTHS[`LICENSE_${category}`]);
}

/** «Licencia · Cat. II» o «Control de calidad». */
export function radiologyKindText(record: Pick<RadiologyRecord, 'kind' | 'category'>): string {
  const kind = RADIOLOGY_KIND_LABELS[record.kind];
  return record.kind === 'LICENSE' && record.category ? `${kind} · Cat. ${record.category}` : kind;
}

/** El encargado de protección radiológica: el miembro del personal o el nombre escrito. */
export function radiologyOfficer(
  record: Pick<RadiologyRecord, 'officerMemberName' | 'officerName'>,
): string | null {
  return record.officerMemberName ?? record.officerName ?? null;
}

/** Cuándo vence, en palabras, con los días de la sede que da la API (0 = hoy). */
export function expiryWhen(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) {
    const late = Math.abs(daysUntilExpiry);
    return late === 1 ? 'Venció ayer' : `Venció hace ${late} días`;
  }
  if (daysUntilExpiry === 0) return 'Vence hoy';
  if (daysUntilExpiry === 1) return 'Vence mañana';
  return `Vence en ${daysUntilExpiry} días`;
}

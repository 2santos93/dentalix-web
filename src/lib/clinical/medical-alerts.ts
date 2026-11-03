import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { SafetyFlags } from '@/lib/clinical/clinical-types';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';
import { civilDateInZone } from '@/lib/format/date';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedePainters } from '@/lib/locations/sede-stamp';

// DX-247: alertas médicas fuera de la ficha (agenda, «En clínica», cabecera de
// la ficha y cita). Textos puros para que el banner, el indicador y los tests
// compartan el mismo vocabulario.

/** Banderas mínimas que la API manda con cada cita (nunca la historia). */
export type MedicalAlertFlags = components['schemas']['MedicalAlertFlagsDto'];
export type MedicalAlertCode = components['schemas']['MedicalAlertCode'];
export type AnamnesisStatus = components['schemas']['AnamnesisStatus'];
/** `GET /patients/:id/medical-alerts`: las banderas con la vigencia y la última revisión. */
export type PatientMedicalAlerts = components['schemas']['PatientMedicalAlertsDto'];
export type AnamnesisLastReview = components['schemas']['AnamnesisLastReviewDto'];
export type AnamnesisConfirmation = components['schemas']['AnamnesisConfirmationDto'];
export type AnamnesisSettings = components['schemas']['AnamnesisSettingsDto'];

/** Bandera → etiqueta. Las mismas en el banner de la ficha y en la agenda. */
export const SAFETY_FLAG_LABELS: Record<Exclude<keyof SafetyFlags, 'semanasEmbarazo'>, string> = {
  embarazo: 'Embarazo',
  anticoagulantes: 'Anticoagulantes',
  bifosfonatos: 'Bifosfonatos',
  diabetes: 'Diabetes',
  profilaxisAntibiotica: 'Requiere profilaxis antibiótica',
  alergiaAnestesico: 'Alergia a anestésico',
  alergiaPenicilina: 'Alergia a penicilina',
  alergiaLatex: 'Alergia a látex',
};

const ALERT_LABELS: Record<MedicalAlertCode, string> = {
  ...SAFETY_FLAG_LABELS,
  // El alérgeno no viaja a la agenda (minimización): se lee en la ficha.
  alergiaMarcada: 'Alergia marcada como alerta (detalle en la ficha)',
};

export const MEDICAL_ALERTS_TITLE = 'Alertas médicas';
export const PREMEDICATION_LABEL = 'Requiere premedicación';
export const PREMEDICATION_HINT =
  'Profilaxis antibiótica: confirma que la tomó antes de empezar.';
export const ANAMNESIS_EXPIRED_LABEL = 'Anamnesis caducada';
export const ANAMNESIS_MISSING_LABEL = 'Sin anamnesis';
const GENERIC_ALERT = 'Alerta médica registrada (detalle en la ficha)';

/** Las alertas con su etiqueta, en el orden del banner. */
export function medicalAlertLines(flags: MedicalAlertFlags): string[] {
  const lines = flags.alerts.map((code) => ALERT_LABELS[code]);
  if (flags.hasCriticalAlert && lines.length === 0) lines.push(GENERIC_ALERT);
  return lines;
}

/**
 * `critical`: hay alertas (rojo, triángulo). `attention`: sin alertas pero la
 * anamnesis caducó o no existe (ámbar, carpeta). `null`: nada que avisar.
 */
export function medicalAlertSeverity(
  flags: MedicalAlertFlags | null | undefined,
): 'critical' | 'attention' | null {
  if (!flags) return null;
  if (flags.hasCriticalAlert) return 'critical';
  return flags.anamnesisStatus === 'CURRENT' ? null : 'attention';
}

/** ¿Hay línea de anamnesis (caducada o ausente)? No depende del formato de la sede. */
export function hasAnamnesisNote(flags: MedicalAlertFlags): boolean {
  return flags.anamnesisStatus === 'MISSING' || flags.anamnesisStatus === 'EXPIRED';
}

/**
 * Línea de la anamnesis: caducada (con su última revisión) o ausente; null si
 * está al día. La fecha, con el formato y la zona de la sede de la pantalla
 * (la ficha de la agenda no trae sede); sin formato, «—» dentro de la frase.
 */
export function anamnesisNote(flags: MedicalAlertFlags, stamp: Pick<SedePainters, 'date'>): string | null {
  if (flags.anamnesisStatus === 'MISSING') return ANAMNESIS_MISSING_LABEL;
  if (flags.anamnesisStatus === 'EXPIRED') {
    return flags.anamnesisReviewedAt
      ? `${ANAMNESIS_EXPIRED_LABEL} · última revisión ${stamp.date(flags.anamnesisReviewedAt)}`
      : ANAMNESIS_EXPIRED_LABEL;
  }
  return null;
}

/** Texto corto visible junto al icono de la cabecera de la ficha. */
export function medicalAlertHeadline(flags: MedicalAlertFlags): string | null {
  if (flags.requiresPremedication) return PREMEDICATION_LABEL;
  if (flags.hasCriticalAlert) return MEDICAL_ALERTS_TITLE;
  if (flags.anamnesisStatus === 'EXPIRED') return ANAMNESIS_EXPIRED_LABEL;
  if (flags.anamnesisStatus === 'MISSING') return ANAMNESIS_MISSING_LABEL;
  return null;
}

/** Todo en una línea, para lectores de pantalla y `aria-label` de las tarjetas. */
export function medicalAlertSummary(flags: MedicalAlertFlags | null | undefined): string {
  if (!flags) return '';
  return [
    flags.requiresPremedication ? PREMEDICATION_LABEL : null,
    ...medicalAlertLines(flags),
    flags.anamnesisStatus === 'EXPIRED'
      ? ANAMNESIS_EXPIRED_LABEL
      : flags.anamnesisStatus === 'MISSING'
        ? ANAMNESIS_MISSING_LABEL
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** El «hoy» de la sede con el que la API evaluó la ficha (no el del navegador). */
export type SedeToday = Pick<PatientMedicalAlerts, 'today' | 'timeZone'>;

/** ¿La última revisión (versión nueva o «Sin cambios hoy») es de hoy en la sede? */
export function reviewedToday(review: AnamnesisLastReview | null | undefined, sede: SedeToday): boolean {
  return !!review && civilDateInZone(review.at, sede.timeZone) === sede.today;
}

/** ¿La última revisión es un «Sin cambios hoy» de hoy en la sede? */
export function confirmedToday(review: AnamnesisLastReview | null | undefined, sede: SedeToday): boolean {
  return review?.kind === 'NO_CHANGES' && reviewedToday(review, sede);
}

/**
 * La fecha de un instante en la zona de la ficha (la que la API usó para
 * evaluar «hoy») y con el formato de la sede de la pantalla; «—» sin formato.
 */
export function sedeDateLabel(value: string, timeZone: string, fmt: RegionalFormat | null): string {
  const instant = new Date(value);
  return fmt && !Number.isNaN(instant.getTime()) ? fmt.date(instant, timeZone) : NO_SEDE_FORMAT;
}

/** La hora de un instante en la zona de la ficha y con el reloj de la sede; «—» sin formato. */
export function sedeTimeLabel(value: string, timeZone: string, fmt: RegionalFormat | null): string {
  const instant = new Date(value);
  return fmt && !Number.isNaN(instant.getTime()) ? fmt.time(instant, timeZone) : NO_SEDE_FORMAT;
}

/** «Sin cambios hoy»: quien ve la anamnesis (la API responde 403 a recepción). */
export function canConfirmAnamnesis(role: ClinicRole | null): boolean {
  return canWriteClinicalHistory(role);
}

/** La vigencia de la clínica la cambia solo ADMIN (la API también lo exige). */
export function canManageAnamnesisSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getPatientMedicalAlerts(token: string, patientId: string): Promise<PatientMedicalAlerts> {
  return apiFetch<PatientMedicalAlerts>(`/patients/${patientId}/medical-alerts`, { token });
}

export function confirmAnamnesisNoChanges(token: string, patientId: string): Promise<AnamnesisConfirmation> {
  return apiFetch<AnamnesisConfirmation>(`/patients/${patientId}/medical-history/no-changes`, {
    method: 'POST',
    token,
  });
}

export function getAnamnesisSettings(token: string): Promise<AnamnesisSettings> {
  return apiFetch<AnamnesisSettings>('/medical-history/settings', { token });
}

export function saveAnamnesisSettings(token: string, input: AnamnesisSettings): Promise<AnamnesisSettings> {
  return apiFetch<AnamnesisSettings>('/medical-history/settings', {
    method: 'PUT',
    body: input,
    token,
  });
}

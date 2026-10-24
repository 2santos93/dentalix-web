import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CancellationByKind = components['schemas']['CancellationByKind'];
export type CancellationReasonCode = components['schemas']['CancellationReasonCode'];
export type StaffCancellationKind = Exclude<CancellationByKind, 'PATIENT_LINK'>;
export type CancellationPreview = components['schemas']['CancellationPreviewDto'];
export type PatientIncidentCounts = components['schemas']['PatientIncidentCountsDto'];
export type PatientAttendanceSummary = components['schemas']['PatientAttendanceSummaryDto'];

/** Tope del detalle libre del motivo (igual que la API). */
export const CANCEL_REASON_TEXT_MAX = 500;

/** Quién cancela, tal como lo elige el personal en la agenda. */
export const STAFF_CANCELLATION_KINDS: readonly StaffCancellationKind[] = ['STAFF_FOR_PATIENT', 'CLINIC'];

export const CANCELLATION_KIND_LABELS: Record<CancellationByKind, string> = {
  PATIENT_LINK: 'El paciente, por el enlace',
  STAFF_FOR_PATIENT: 'El paciente avisa',
  CLINIC: 'La clínica',
};

export const CANCELLATION_KIND_HINTS: Record<StaffCancellationKind, string> = {
  STAFF_FOR_PATIENT: 'Llamó, escribió o lo dijo en persona. Cuenta para la política de la sede.',
  CLINIC: 'La clínica cancela o reprograma. Nunca cuenta como tardía.',
};

/** Catálogo cerrado del motivo, en el orden del selector. */
export const CANCELLATION_REASON_CODES: readonly CancellationReasonCode[] = [
  'ILLNESS',
  'FORGOT',
  'COST',
  'TRANSPORT',
  'WORK',
  'CLINIC_RESCHEDULE',
  'OTHER',
];

export const CANCELLATION_REASON_LABELS: Record<CancellationReasonCode, string> = {
  ILLNESS: 'Enfermedad',
  FORGOT: 'Olvido',
  COST: 'Costo',
  TRANSPORT: 'Transporte',
  WORK: 'Trabajo',
  CLINIC_RESCHEDULE: 'La clínica reprograma',
  OTHER: 'Otro',
};

/** «5 h», «45 min», «5 h 30 min»; 0 = «0 min». */
export function formatNotice(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Aviso del diálogo de cancelar (DX-279) cuando la cancelación del paciente
 * sería tardía: «Cancelación tardía: aviso de 5 h, la política pide 24 h».
 * `null` si no lo es (o si no hay política).
 */
export function lateCancellationWarning(preview: CancellationPreview | null): string | null {
  if (!preview?.lateCancellation || !preview.policy) return null;
  return `Cancelación tardía: aviso de ${formatNotice(preview.noticeMinutes)}, la política pide ${preview.policy.noticeHours} h`;
}

/** `GET /appointments/:id/cancellation-preview` — el aviso si se cancelara ahora. */
export function getCancellationPreview(token: string, appointmentId: string): Promise<CancellationPreview> {
  return apiFetch<CancellationPreview>(
    `/appointments/${encodeURIComponent(appointmentId)}/cancellation-preview`,
    { token },
  );
}

/** `GET /patients/:id/attendance-summary` — 12 meses, por sede y en total. */
export function getPatientAttendance(token: string, patientId: string): Promise<PatientAttendanceSummary> {
  return apiFetch<PatientAttendanceSummary>(
    `/patients/${encodeURIComponent(patientId)}/attendance-summary`,
    { token },
  );
}

/**
 * Texto de la insignia (DX-279): «2 inasistencias · 1 cancelación tardía
 * (12 meses)». Solo lo que hay; `null` sin incidencias (no se pinta nada).
 */
export function attendanceBadgeText(counts: PatientIncidentCounts | null | undefined): string | null {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.noShows > 0) {
    parts.push(`${counts.noShows} ${counts.noShows === 1 ? 'inasistencia' : 'inasistencias'}`);
  }
  if (counts.lateCancellations > 0) {
    parts.push(
      `${counts.lateCancellations} ${counts.lateCancellations === 1 ? 'cancelación tardía' : 'cancelaciones tardías'}`,
    );
  }
  return parts.length ? `${parts.join(' · ')} (12 meses)` : null;
}

/**
 * La cancelación de una cita en una línea, para su detalle: «La clínica ·
 * Enfermedad · aviso de 5 h · tardía». `null` si la cita no tiene datos de
 * cancelación (las antiguas).
 */
export function cancellationSummary(appointment: {
  cancelledByKind?: CancellationByKind | null;
  cancelReasonCode?: CancellationReasonCode | null;
  noticeMinutes?: number | null;
  lateCancellation?: boolean | null;
}): string | null {
  if (!appointment.cancelledByKind) return null;
  const parts = [CANCELLATION_KIND_LABELS[appointment.cancelledByKind]];
  if (appointment.cancelReasonCode) parts.push(CANCELLATION_REASON_LABELS[appointment.cancelReasonCode]);
  if (appointment.noticeMinutes != null) parts.push(`aviso de ${formatNotice(appointment.noticeMinutes)}`);
  if (appointment.lateCancellation) parts.push('tardía');
  return parts.join(' · ');
}

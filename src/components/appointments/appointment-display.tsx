'use client';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import { formatTime } from '@/lib/format/date';

/** es status labels — shared by `DayAgenda` and `WeekAgenda` (and their status <select>s). */
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

// One semantic-token class per status — never a raw color utility
// (`bg-*-500`, `text-[#...]`). SCHEDULED/CONFIRMED use the neutral/brand
// tokens (nothing has happened yet / it's been acknowledged); COMPLETED maps
// to success, CANCELLED to danger, NO_SHOW to warning (attention-worthy but
// not an error).
export const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-muted bg-muted/10 text-muted',
  CONFIRMED: 'border-primary bg-primary/10 text-primary',
  COMPLETED: 'border-success bg-success/10 text-success',
  CANCELLED: 'border-danger bg-danger/10 text-danger',
  NO_SHOW: 'border-warning bg-warning/10 text-warning',
};

/** e.g. "09:00–09:30", 24h times in the user's local timezone. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/**
 * Display name for an appointment's patient. Prefers the name the API joins
 * onto the appointment itself; falls back to an optional `patientId -> name`
 * map (kept for callers that still pass one), then to the raw id.
 *
 * The name used to come ONLY from that map, built via
 * `GET /patients?pageSize=100` — so any patient past the first 100 rendered
 * as a UUID. The joined fields make the label correct at any clinic size.
 */
export function patientLabel(
  appointment: Appointment,
  patientNames?: Record<string, string>,
): string {
  const joined = [appointment.patientFirstName, appointment.patientLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (joined) return joined;
  return patientNames?.[appointment.patientId] ?? appointment.patientId;
}

/** Read-only colored status pill — shared by the day and week agenda views. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      data-testid="appointment-status-badge"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

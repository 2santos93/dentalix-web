import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-026: la API documenta las respuestas con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type LocationReminderSettings = components['schemas']['LocationReminderSettingsDto'];
export type UpdateReminderSettingsInput = components['schemas']['UpdateReminderSettingsDto'];
export type AppointmentReminders = components['schemas']['AppointmentRemindersDto'];
export type AppointmentReminderItem = components['schemas']['AppointmentReminderItemDto'];
export type ReminderSkipReason = NonNullable<AppointmentReminderItem['skipReason']>;

/** Límites de la API (y del CHECK de la tabla). */
export const MAX_REMINDER_LEADS = 3;
export const MIN_LEAD_HOURS = 1;
export const MAX_LEAD_HOURS = 168;

/** Configurar recordatorios: solo ADMIN (como la API, que también lo exige). */
export function canManageReminders(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /reminder-settings`: las sedes de la clínica con sus ajustes (solo ADMIN). */
export async function listReminderSettings(token: string): Promise<LocationReminderSettings[]> {
  return apiFetch<LocationReminderSettings[]>('/reminder-settings', { token });
}

/** `PUT /reminder-settings/:locationId`: reemplaza los ajustes de una sede. */
export async function updateReminderSettings(
  token: string,
  locationId: string,
  input: UpdateReminderSettingsInput,
): Promise<LocationReminderSettings> {
  return apiFetch<LocationReminderSettings>(`/reminder-settings/${encodeURIComponent(locationId)}`, {
    method: 'PUT',
    body: input,
    token,
  });
}

/** `GET /appointments/:id/reminders`: estado de los recordatorios de la cita. */
export async function getAppointmentReminders(
  token: string,
  appointmentId: string,
): Promise<AppointmentReminders> {
  return apiFetch<AppointmentReminders>(
    `/appointments/${encodeURIComponent(appointmentId)}/reminders`,
    { token },
  );
}

/** Motivo de omisión tal como lo lee recepción. */
export const SKIP_REASON_LABELS: Record<ReminderSkipReason, string> = {
  NO_EMAIL: 'sin email',
  CANCELLED: 'cita cancelada',
  COMPLETED: 'cita atendida',
  NO_SHOW: 'no asistió',
  RESCHEDULED: 'reprogramada',
  DELETED: 'cita eliminada',
  DISABLED: 'recordatorios desactivados',
  TOO_LATE: 'la cita ya había empezado',
};

/** «2 h», «1 día», «2 días»: días si la antelación es en días enteros. */
function leadAmount(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 día' : `${days} días`;
  }
  return `${hours} h`;
}

/** «2 días antes», «2 h antes». */
export function leadHoursLabel(hours: number): string {
  return `${leadAmount(hours)} antes`;
}

/** «2 días y 2 h antes» (de mayor a menor, como salen). */
export function leadListLabel(leadHours: readonly number[]): string {
  if (leadHours.length === 0) return 'Sin antelaciones';
  const parts = leadHours.map(leadAmount);
  const head = parts.slice(0, -1).join(', ');
  return `${head ? `${head} y ` : ''}${parts[parts.length - 1]} antes`;
}

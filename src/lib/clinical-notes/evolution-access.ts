import type { ClinicRole } from '@/lib/me/me-api';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';
import { wallDay } from '@/lib/time/wall-clock';

/**
 * «Registrar evolución» en la tarjeta de la cita (DX-170): solo quien escribe
 * historia clínica (recepción no: la API responde 403), y solo en una cita
 * atendida o del día. Una cancelada, un no-show o una cita de un día futuro
 * (aunque esté marcada atendida) no tienen evolución: la API responde 400.
 * El día de la cita y «hoy» se cuentan en la zona de la sede (`timeZone`).
 */
export function canRegisterEvolution(
  role: ClinicRole | null,
  appointment: { start: string; status: string },
  today: string,
  timeZone: string,
): boolean {
  if (!canWriteClinicalHistory(role)) return false;
  if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') return false;
  const day = wallDay(appointment.start, timeZone);
  if (day > today) return false;
  return appointment.status === 'COMPLETED' || day === today;
}

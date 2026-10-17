import type { ClinicRole } from '@/lib/me/me-api';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';

/** Día local `yyyy-mm-dd` de un instante. */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * «Registrar evolución» en la tarjeta de la cita (DX-170): solo quien escribe
 * historia clínica (recepción no: la API responde 403), y solo en una cita
 * atendida o del día. Una cancelada o un no-show no tienen evolución (la API
 * responde 400).
 */
export function canRegisterEvolution(
  role: ClinicRole | null,
  appointment: { start: string; status: string },
  today: string,
): boolean {
  if (!canWriteClinicalHistory(role)) return false;
  if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') return false;
  return appointment.status === 'COMPLETED' || localDayOf(appointment.start) === today;
}
